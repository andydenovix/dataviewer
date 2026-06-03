"use client";

import React, { useState } from 'react';
import { db, storage } from '../lib/firebase';
import { collection, addDoc, updateDoc, serverTimestamp, doc, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { parseFile } from '../lib/parsers';
import { LabSample } from '../types';
import { useAuth } from '../lib/AuthContext';
import { BRAND_COLOR } from '../lib/constants';

export const FileUpload: React.FC = () => {
  // Helper to parse "31-12-1999 19:36" (DD-MM-YYYY HH:mm)
  const parseDeNovixDate = (dateStr: string): Date => {
    try {
      // Try native JS parsing first (handles YYYY-MM-DD formats found in A280 exports)
      const nativeDate = new Date(dateStr);
      if (!isNaN(nativeDate.getTime())) return nativeDate;

      // Fallback for custom DD-MM-YYYY format
      const [datePart, timePart] = dateStr.split(' ');
      const [day, month, year] = datePart.split('-').map(Number);
      const [hours, minutes] = timePart.split(':').map(Number);
      const date = new Date(year, month - 1, day, hours, minutes);
      return isNaN(date.getTime()) ? new Date() : date;
    } catch (e) {
      return new Date();
    }
  };

  // Helper to parse AOPI image filenames: Sample_Name97_bf_0709720241115082924.png
  const parseAOPIFilename = (fileName: string) => {
    const regex = /^(.*?)(\d+)_(bf|green|red|result)_(.*)\.(png|jpg|jpeg|webp|pdf)$/i;
    const match = fileName.match(regex);
    if (!match) return null;
    
    return {
      sampleNamePart: match[1].replace(/_/g, ' ').trim(), // Convert underscores back to spaces
      resultId: match[2],
      tag: match[3].toLowerCase(),
      suffix: match[4]
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

      // Map to track created documents for image linking within this batch
      const createdDocsMap = new Map<string, string>(); // Key: "SampleName_ResultID", Value: DocID
      const batch = writeBatch(db);

      if (csvFile) {
        const parsedRows = await parseFile(csvFile);
        
        for (const row of parsedRows) {
          const measuredAt = row.rawDate 
            ? parseDeNovixDate(row.rawDate) 
            : new Date(csvFile.lastModified);

          // 1. Clean metadata immediately so we can use it for detection
          const cleanMetadata: Record<string, any> = {};
          Object.entries(row.metadata || {}).forEach(([key, value]) => {
            const trimmedKey = key.trim();
            if (trimmedKey) {
              cleanMetadata[trimmedKey] = typeof value === 'string' ? value.trim() : value;
            }
          });

          // Helper to find data in metadata regardless of spaces/casing
          const findMeta = (part: string) => {
            const partClean = part.toUpperCase().replace(/[^A-Z0-9]/g, '');
            const entry = Object.entries(cleanMetadata).find(([k]) => 
              k.toUpperCase().replace(/[^A-Z0-9]/g, '').includes(partClean)
            );
            return entry ? entry[1] : undefined;
          };

          const resultId = String(findMeta('ResultID') || findMeta('ID') || row.metadata?.['Result ID'] || '').trim();

          // 2. Extract cell count data using fuzzy keys and row fallbacks
          const viabilityVal = findMeta('Viability') ?? row.viability;
          const totalVal = findMeta('TotalCells/mL') ?? findMeta('TotalCellCount') ?? findMeta('TotalCount') ?? row.totalCells;
          const liveVal = findMeta('LiveCells/mL') ?? findMeta('LiveCellCount') ?? row.liveCells;
          const deadVal = findMeta('DeadCells/mL') ?? findMeta('DeadCellCount') ?? row.deadCells;

          // 3. Detect if this is a Cell Counting (CellDrop) sample
          const appName = (row.application || cleanMetadata['Application'] || '').trim().toUpperCase();
          const metaKeys = Object.keys(cleanMetadata).map(k => k.toUpperCase());
          const metaValues = Object.values(cleanMetadata).map(v => String(v).toUpperCase());
          
          const hasCellMarkers = 
            metaKeys.some(k => 
              k.includes('VIABILITY') || k.includes('CELLS/ML') || k.includes('CELL COUNT') || 
              k.includes('DIAMETER') || k.includes('AOPI') || k.includes('CLUSTER') || k === 'PROTOCOL'
            ) ||
            metaValues.some(v => v.includes('AOPI') || v.includes('CELLDROP'));

          const isCellCount = 
            hasCellMarkers ||
            appName.includes('CELL') || 
            appName.includes('AOPI') || 
            appName.includes('AO/PI') || 
            appName.includes('COUNT') ||
            totalVal !== undefined ||
            cleanMetadata['% Viability'] !== undefined || 
            cleanMetadata['Total Cell Count'] !== undefined ||
            cleanMetadata['Live Cells/mL'] !== undefined ||
            cleanMetadata['Total Cells/mL'] !== undefined ||
            cleanMetadata['Protocol'] !== undefined;

          // Force application name if detected as cell count but app name is generic or missing
          const finalApp = isCellCount && (appName === 'Cell Count' || !appName) ? 'AOPI' : appName;

          // Prepare metadata with cell count data and protocol name
          const cellCountData = isCellCount ? {
            totalCells: typeof totalVal === 'number' ? totalVal : parseFloat(String(totalVal || 0)),
            liveCells: typeof liveVal === 'number' ? liveVal : parseFloat(String(liveVal || 0)),
            deadCells: typeof deadVal === 'number' ? deadVal : parseFloat(String(deadVal || 0)),
            viability: typeof viabilityVal === 'number' ? viabilityVal : parseFloat(String(viabilityVal || 0)),
          } : undefined;
          
          const finalMetadata: LabSample['metadata'] = { 
            ...cleanMetadata, 
            unit: row.unit || cleanMetadata['Units'] || cleanMetadata['Unit'] || 'AU',
            cellCountData
          };
          
          if (row.protocolName) {
            finalMetadata.protocolName = row.protocolName;
          }

          const newSample: Omit<LabSample, 'id'> = {
            userId: user.uid,
            sampleName: (row.sampleName || cleanMetadata['Sample Name'] || csvFile?.name.replace(/\.[^/.]+$/, "") || "Unnamed").trim(),
            projectId: null,
            sampleType: isCellCount 
              ? 'cell-count' 
              : (row.wavelengths.length > 0 ? 'spectro' : 'fluor'),
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
          const lookupKey = `${newSample.sampleName.replace(/\s+/g, '_')}${resultId}`;
          
          batch.set(docRef, newSample);
          createdDocsMap.set(lookupKey, docRef.id);
        }
        
        await batch.commit();
      }

      // Process Images
      const imageUploadPromises = imageFiles.map(async (imgFile) => {
        const parsed = parseAOPIFilename(imgFile.name);
        if (!parsed) return;

        const lookupKey = `${parsed.sampleNamePart.replace(/\s+/g, '_')}${parsed.resultId}`;
        const targetDocId = createdDocsMap.get(lookupKey);

        if (targetDocId) {
          const storageRef = ref(storage, `samples/${targetDocId}/${parsed.tag}_${imgFile.name}`);
          const snapshot = await uploadBytes(storageRef, imgFile);
          const downloadUrl = await getDownloadURL(snapshot.ref);

          // Update the existing sample doc with the specific image tag
          const sampleRef = doc(db, 'samples', targetDocId);
          await updateDoc(sampleRef, {
            [`images.${parsed.tag}`]: downloadUrl
          });
        }
      });

      await Promise.all(imageUploadPromises);
      
      // Fallback for standalone images (not associated with a CSV in this batch)
      if (!csvFile && imageFiles.length > 0) {
         alert("Standalone image upload detected. Currently, images must be uploaded alongside their source CSV to be associated automatically.");
      }

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
        <input
          type="file"
          className="hidden"
          accept=".csv,.xls,.xlsx,image/*"
          multiple
          onChange={handleFileChange}
          disabled={uploading}
        />
      </label>
    </div>
    </div>
  );
};