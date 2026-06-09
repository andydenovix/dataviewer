"use client";

import React, { useState } from 'react';
import { db, storage } from '../lib/firebase';
import { collection, updateDoc, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { parseFile } from '../lib/parsers';
import { LabSample } from '../types';
import { useAuth } from '../lib/AuthContext';
import { BRAND_COLOR } from '../lib/constants';

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

  const [uploading, setUploading] = useState(false);
  const { user } = useAuth();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
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
        
        for (const row of parsedRows) {
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

          const viabilityVal = findMeta('Viability') ?? row.viability;
          const totalVal = findMeta('TotalCells/mL') ?? findMeta('TotalCellCount') ?? findMeta('TotalCount') ?? row.totalCells;
          const liveVal = findMeta('LiveCells/mL') ?? findMeta('LiveCellCount') ?? row.liveCells;
          const deadVal = findMeta('DeadCells/mL') ?? findMeta('DeadCellCount') ?? row.deadCells;

          const appName = (row.application || cleanMetadata['Application'] || '').trim().toUpperCase();
          const metaKeys = Object.keys(cleanMetadata).map(k => k.toUpperCase());
          const metaValues = Object.values(cleanMetadata).map(v => String(v).toUpperCase());
          
          const hasCellMarkers = metaKeys.some(k => k.includes('VIABILITY') || k.includes('CELLS/ML') || k.includes('CELL COUNT') || k.includes('AOPI')) || metaValues.some(v => v.includes('AOPI') || v.includes('CELLDROP'));

          const isCellCount = row.wavelengths.length === 0 && (hasCellMarkers || appName.includes('CELL') || appName.includes('AOPI') || appName.includes('COUNT') || totalVal !== undefined);

          const finalApp = isCellCount && (appName === 'CELL COUNT' || !appName) ? 'AOPI' : appName;

          const cellCountData = isCellCount ? {
            totalCells: typeof totalVal === 'number' ? totalVal : parseFloat(String(totalVal || 0)),
            liveCells: typeof liveVal === 'number' ? liveVal : parseFloat(String(liveVal || 0)),
            deadCells: typeof deadVal === 'number' ? deadVal : parseFloat(String(deadVal || 0)),
            viability: typeof viabilityVal === 'number' ? viabilityVal : parseFloat(String(viabilityVal || 0)),
          } : null;
          
          const finalMetadata: LabSample['metadata'] = { ...cleanMetadata, unit: row.unit || cleanMetadata['Units'] || 'AU', cellCountData };
          
          const newSample: Omit<LabSample, 'id'> = {
            userId: user.uid,
            sampleName: (row.sampleName || cleanMetadata['Sample Name'] || csvFile?.name.replace(/\.[^/.]+$/, "") || "Unnamed").trim(),
            projectId: null,
            sampleType: isCellCount ? 'cell-count' : (row.wavelengths.length > 0 ? 'spectro' : 'fluor'),
            application: finalApp || 'General Absorbance',
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
      if (event.target) event.target.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-8 border-2 border-dashed border-blue-200 rounded-xl bg-blue-50/50 hover:bg-blue-50 transition-colors text-center">
        <label className="cursor-pointer block">
          <div className="space-y-2">
            <div className="text-lg font-medium" style={{ color: BRAND_COLOR }}>
              {uploading ? 'Processing Data...' : 'Upload Data'}
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