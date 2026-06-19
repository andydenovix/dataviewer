"use client";

import React, { useState } from 'react';
import { db, storage } from '../lib/firebase';
import { collection, updateDoc, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { parseFile } from '../lib/parsers';
import { LabSample } from '../types';
import { useAuth } from '../lib/AuthContext';
import { useProtocols } from '@/hooks/useProtocols';
import { BRAND_COLOR } from '../lib/constants';
import { FlaskConical } from 'lucide-react';

export const FileUpload: React.FC = () => {
  const parseDeNovixDate = (dateStr: string): Date => {
    try {
      const nativeDate = new Date(dateStr);
      if (!isNaN(nativeDate.getTime())) return nativeDate;
      const [datePart, timePart] = dateStr.split(' ');
      const [day, month, year] = datePart.split('-').map(Number);
      const [hours, minutes] = timePart.split(':').map(Number);
      const date = new Date(year, month - 1, day, hours, minutes);
      return isNaN(date.getTime()) ? new Date() : date;
    } catch (e) {
      return new Date();
    }
  };

  const parseAOPIFilename = (fileName: string) => {
    const regex = /^(.*?)(\d+)_(bf|red|green|result)_(.*)\.(png|jpg|jpeg|webp|pdf)$/i;
    const match = fileName.match(regex);
    if (!match) return null;
    
    return {
      resultId: match[2],
      tag: match[3].toLowerCase()
    };
  };

  // Helper to find and parse numeric values from metadata, prioritizing specific keys
  const getNumericValueFromMetadata = (metadata: Record<string, any>, keys: string[], defaultValue: number | undefined = undefined): number | undefined => {
    for (const key of keys) {
      const cleanedKey = key.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const entry = Object.entries(metadata).find(([k]) => 
        k.toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanedKey
      );
      if (entry && (entry[1] !== undefined && entry[1] !== null && entry[1] !== '')) {
        const parsed = parseFloat(String(entry[1]));
        if (!isNaN(parsed)) return parsed;
      }
    }
    return defaultValue;
  };

  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedProtocolId, setSelectedProtocolId] = useState('');
  const { user } = useAuth();
  const protocols = useProtocols(user);

  const processFiles = async (files: File[]) => {
    if (files.length === 0 || !user) {
      if (!user) alert("Please sign in to upload data.");
      return;
    }
    setUploading(true);
    try {
      const csvFile = files.find(f => f.name.endsWith('.csv') || f.name.endsWith('.xlsx') || f.name.endsWith('.xls'));
      const imageFiles = files.filter(f => f.type.startsWith('image/') || f.name.endsWith('.pdf'));

      const createdDocsMap = new Map<string, string>(); 
      const batch = writeBatch(db);

      if (csvFile) {
        const parsedRows = await parseFile(csvFile);

        if (parsedRows.length === 0) {
          alert('No data rows found in the file. Check that it is a valid DeNovix export.');
          return;
        }

        const invalidRows = parsedRows.filter(row => {
          const name = (row.sampleName || row.metadata?.['Sample Name'] || '').trim();
          const hasName = name.length > 0;
          const hasData =
            row.wavelengths?.length > 0 ||
            row.concentration != null ||
            row.rfu != null ||
            row.totalCells != null;
          return !hasName || !hasData;
        });

        if (invalidRows.length === parsedRows.length) {
          alert(
            'The file could not be parsed correctly — no recognisable sample data was found.\n\n' +
            'Make sure this is a DeNovix CSV or Excel export with standard column headers.'
          );
          return;
        }

        if (invalidRows.length > 0) {
          const proceed = window.confirm(
            `${invalidRows.length} of ${parsedRows.length} rows have missing names or data and will be skipped.\n\nProceed with the remaining ${parsedRows.length - invalidRows.length} rows?`
          );
          if (!proceed) return;
        }

        const validRows = parsedRows.filter(row => {
          const name = (row.sampleName || row.metadata?.['Sample Name'] || '').trim();
          const hasData =
            row.wavelengths?.length > 0 ||
            row.concentration != null ||
            row.rfu != null ||
            row.totalCells != null;
          return name.length > 0 && hasData;
        });

        for (const row of validRows) {
          const measuredAt = row.rawDate 
            ? parseDeNovixDate(row.rawDate) 
            : new Date(csvFile.lastModified);

          const cleanMetadata: Record<string, any> = {};
          Object.entries(row.metadata || {}).forEach(([key, value]) => {
            const trimmedKey = key.trim();
            if (trimmedKey) {
              cleanMetadata[trimmedKey] = typeof value === 'string' ? value.trim() : value;
            }
          });

          const findMeta = (part: string) => {
            const partClean = part.toUpperCase().replace(/[^A-Z0-9]/g, '');
            const entry = Object.entries(cleanMetadata).find(([k]) => 
              k.toUpperCase().replace(/[^A-Z0-9]/g, '').includes(partClean)
            );
            return entry ? entry[1] : undefined;
          };

          const resultId = String(findMeta('ResultID') || findMeta('ID') || row.metadata?.['Result ID'] || '').trim();

          const viabilityVal = getNumericValueFromMetadata(cleanMetadata, ['Viability', '% Viability']) ?? row.viability;
          const totalVal = getNumericValueFromMetadata(cleanMetadata, ['TotalCells/mL', 'Total Cell Count', 'Total Count']) ?? row.totalCells;
          const liveVal = getNumericValueFromMetadata(cleanMetadata, ['LiveCells/mL', 'Live Cell Count', 'Live Count']) ?? row.liveCells;
          const deadVal = getNumericValueFromMetadata(cleanMetadata, ['DeadCells/mL', 'Dead Cell Count', 'Dead Count']) ?? row.deadCells;
          const meanDiameterVal = getNumericValueFromMetadata(cleanMetadata, ['MeanDiameter', 'Mean Diameter (um)']);

          const appName = (row.application || cleanMetadata['Application'] || '').trim().toUpperCase();
          const metaKeys = Object.keys(cleanMetadata).map(k => k.toUpperCase());
          const metaValues = Object.values(cleanMetadata).map(v => String(v).toUpperCase());
          
          const hasCellMarkers = metaKeys.some(k => k.includes('VIABILITY') || k.includes('CELLS/ML') || k.includes('CELL COUNT') || k.includes('AOPI')) || metaValues.some(v => v.includes('AOPI') || v.includes('CELLDROP'));
          const isCellCount = row.wavelengths.length === 0 && (hasCellMarkers || appName.includes('CELL') || appName.includes('AOPI') || appName.includes('COUNT') || totalVal !== undefined);

          const finalApp = isCellCount && (appName === 'CELL COUNT' || !appName) ? 'AOPI' : (appName || 'General Absorbance');

          const cellCountData: import('../types').CellCountData | undefined = isCellCount
            ? {
                totalCells: totalVal ?? 0,
                liveCells: liveVal ?? 0,
                deadCells: deadVal ?? 0,
                viability: viabilityVal ?? 0,
                ...(meanDiameterVal != null ? { meanDiameter: meanDiameterVal } : {}),
              }
            : undefined;
          
          const activeProtocol = protocols.find(p => p.id === selectedProtocolId);
          const finalMetadata: LabSample['metadata'] = {
            ...cleanMetadata,
            unit: row.unit || cleanMetadata['Units'] || 'AU',
            cellCountData: cellCountData,
            ...(activeProtocol ? { protocolName: activeProtocol.name } : {}),
          };

          const newSample: Omit<LabSample, 'id'> = {
            userId: user.uid,
            sampleName: (row.sampleName || cleanMetadata['Sample Name'] || csvFile?.name.replace(/\.[^/.]+$/, "") || "Unnamed").trim(),
            projectId: null,
            sampleType: isCellCount ? 'cell-count' : (row.wavelengths.length > 0 ? 'spectro' : 'fluor'),
            application: activeProtocol?.application || finalApp || 'General Absorbance',
            concentration: row.concentration || 0,
            rfu: row.rfu || 0,
            stockConcentration: row.stockConcentration || 0,
            dilutionFactor: row.dilutionFactor || 1,
            curveType: row.curveType || 'Linear',
            ratios: row.ratios || {},
            alerts: row.alerts || [],
            measuredAt: measuredAt,
            createdAt: serverTimestamp(),
            data: { wavelengths: row.wavelengths, absorbance: row.absorbance },
            images: {},
            metadata: finalMetadata,
            ...(activeProtocol?.id ? { protocolId: activeProtocol.id } : {}),
          };

          const docRef = doc(collection(db, 'samples'));
          
          if (resultId) {
            createdDocsMap.set(`id_${resultId}`, docRef.id);
          }
          
          batch.set(docRef, newSample);
        }
        
        await batch.commit();
      }

      const imageUploadPromises = imageFiles.map(async (imgFile) => {
        const parsed = parseAOPIFilename(imgFile.name);
        if (!parsed) return;

        const lookupKey = `id_${parsed.resultId}`;
        const targetDocId = createdDocsMap.get(lookupKey);

        if (targetDocId) {
          const storageRef = ref(storage, `samples/${targetDocId}/${parsed.tag}_${imgFile.name}`);
          const snapshot = await uploadBytes(storageRef, imgFile);
          const downloadUrl = await getDownloadURL(snapshot.ref);

          const sampleRef = doc(db, 'samples', targetDocId);
          await updateDoc(sampleRef, { [`images.${parsed.tag}`]: downloadUrl });
        }
      });

      await Promise.all(imageUploadPromises);

      alert('File uploaded and parsed successfully!');
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Failed to upload file.');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    await processFiles(files);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    await processFiles(files);
  };

  const activeProtocol = protocols.find(p => p.id === selectedProtocolId);

  return (
    <div className="space-y-3">
      {protocols.length > 0 && (
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 shrink-0 text-slate-400" />
          <select
            value={selectedProtocolId}
            onChange={e => setSelectedProtocolId(e.target.value)}
            className="flex-1 px-3 py-1.5 border rounded-lg text-sm bg-white outline-none font-medium"
          >
            <option value="">No protocol</option>
            {protocols.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}
      {activeProtocol?.operatorNotes && (
        <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          <span className="font-bold">Protocol note: </span>{activeProtocol.operatorNotes}
        </div>
      )}
      <div
        className={`p-8 border-2 border-dashed rounded-xl transition-all text-center ${
          isDragging
            ? 'border-blue-400 bg-blue-100 scale-[1.01]'
            : 'border-blue-200 bg-blue-50/50 hover:bg-blue-50'
        }`}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false); }}
        onDrop={handleDrop}
      >
        <label className="cursor-pointer block">
          <div className="space-y-2 pointer-events-none">
            <div className="text-lg font-medium" style={{ color: BRAND_COLOR }}>
              {uploading ? 'Processing Data…' : isDragging ? 'Drop to upload' : 'Upload Data'}
            </div>
            <p className="text-sm" style={{ color: BRAND_COLOR, opacity: 0.7 }}>
              Drag & drop or click to upload .csv, .xls, .xlsx or images
            </p>
          </div>
          <input type="file" className="hidden" accept=".csv,.xls,.xlsx,image/*" multiple onChange={handleFileChange} disabled={uploading} />
        </label>
      </div>
    </div>
  );
};