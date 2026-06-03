"use client";

import React, { useState, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';
import { LabSample } from '../types';
import { Search, Plus, X, BarChart2, Info } from 'lucide-react';
import { convertFirestoreTimestampToDate } from '@/lib/utils';

interface ReplicateManagerProps {
  samples: LabSample[];
  onClose: () => void;
}

export const ReplicateManager: React.FC<ReplicateManagerProps> = ({ samples, onClose }) => {
  const [bucket, setBucket] = useState<LabSample[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Recommendation Logic: Group by exact name match or 90% name similarity within 1 hour
  const recommendations = useMemo(() => {
    const recs: Record<string, LabSample[]> = {};
    
    samples.forEach(s => {
      if (s.replicateGroupId) return;
      const key = s.sampleName.toLowerCase().trim();
      if (!recs[key]) recs[key] = [];
      recs[key].push(s);
    });

    return Object.entries(recs).filter(([_, group]) => group.length > 1);
  }, [samples]);

  const availableSamples = samples.filter(s => 
    !s.replicateGroupId && 
    !bucket.find(b => b.id === s.id) &&
    s.sampleName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const addToBucket = (sample: LabSample) => {
    setBucket(prev => [...prev, sample]);
  };

  const removeFromBucket = (id: string) => {
    setBucket(prev => prev.filter(s => s.id !== id));
  };

  const calculateStats = (data: number[]) => {
    const n = data.length;
    if (n < 2) return null;
    const mean = data.reduce((a, b) => a + b) / n;
    const sd = Math.sqrt(data.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / (n - 1));
    const cv = (sd / mean) * 100;
    return { mean, sd, cv };
  };

  const handleFinalize = async () => {
    if (bucket.length < 2) return;

    const groupId = `group_${Date.now()}`;
    const concentrations = bucket.map(s => s.concentration || 0);
    const stats = calculateStats(concentrations);

    try {
      const batch = writeBatch(db);
      bucket.forEach(sample => {
        const ref = doc(db, 'samples', sample.id!);
        batch.update(ref, {
          replicateGroupId: groupId,
          'metadata.replicateStats': stats
        });
      });
      await batch.commit();
      alert(`Grouped ${bucket.length} samples. CV: ${stats?.cv.toFixed(2)}%`);
      setBucket([]);
    } catch (err) {
      console.error("Grouping failed", err);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-200 flex flex-col h-[700px]">
      <div className="p-4 border-b flex justify-between items-center bg-slate-50 rounded-t-xl">
        <div className="flex items-center gap-2">
          <BarChart2 className="text-blue-600 h-5 w-5" />
          <h2 className="font-bold text-slate-800">Identify Replicates</h2>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X /></button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Source List */}
        <div className="w-1/2 border-r flex flex-col p-4">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search available samples..."
              className="w-full pl-9 pr-3 py-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {recommendations.length > 0 && searchTerm === '' && (
            <div className="mb-6">
              <h4 className="text-xs font-bold text-blue-600 uppercase mb-2 flex items-center gap-1">
                <Info className="h-3 w-3" /> Smart Recommendations
              </h4>
              <div className="space-y-2">
                {recommendations.slice(0, 3).map(([name, group]) => (
                  <button 
                    key={name}
                    onClick={() => group.forEach(addToBucket)}
                    className="w-full p-2 bg-blue-50 border border-blue-100 rounded text-left text-sm hover:bg-blue-100 transition-colors"
                  >
                    Add all "{name}" ({group.length})
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-1">
            <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Available Samples</h4>
            {availableSamples.map(s => (
              <div 
                key={s.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('sampleId', s.id!)}
                className="flex justify-between items-center p-2 border rounded hover:border-blue-300 cursor-grab active:cursor-grabbing bg-white text-sm"
              >
                <span>{s.sampleName}</span>
                <button onClick={() => addToBucket(s)} className="text-blue-500 hover:text-blue-700"><Plus className="h-4 w-4"/></button>
              </div>
            ))}
          </div>
        </div>

        {/* Right: The Bucket */}
        <div 
          className="w-1/2 bg-slate-50/50 p-4 flex flex-col"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const id = e.dataTransfer.getData('sampleId');
            const sample = samples.find(s => s.id === id);
            if (sample) addToBucket(sample);
          }}
        >
          <h4 className="text-xs font-bold text-slate-400 uppercase mb-4">Replicate Bucket</h4>
          
          <div className="flex-1 border-2 border-dashed border-slate-200 rounded-lg flex flex-col overflow-hidden bg-white">
            {bucket.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm p-8 text-center italic">
                Drag samples here or click (+) to form a replicate group
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {bucket.map(s => (
                  <div key={s.id} className="flex justify-between items-center p-2 bg-slate-50 rounded border text-sm">
                    <span>{s.sampleName}</span>
                    <button onClick={() => removeFromBucket(s.id!)} className="text-slate-400 hover:text-red-500"><X className="h-4 w-4"/></button>
                  </div>
                ))}
              </div>
            )}

            {bucket.length >= 2 && (
              <div className="p-4 bg-white border-t space-y-3">
                <div className="grid grid-cols-3 text-center gap-2">
                  <div className="bg-slate-50 p-2 rounded">
                    <div className="text-[10px] text-slate-400 uppercase">Mean</div>
                    <div className="font-mono font-bold">{(bucket.map(s => s.concentration || 0).reduce((a, b) => a + b) / bucket.length).toFixed(2)}</div>
                  </div>
                  <div className="bg-slate-50 p-2 rounded">
                    <div className="text-[10px] text-slate-400 uppercase">%CV</div>
                    <div className="font-mono font-bold text-blue-600">{calculateStats(bucket.map(s => s.concentration || 0))?.cv.toFixed(1)}%</div>
                  </div>
                </div>
                <button 
                  onClick={handleFinalize}
                  className="w-full py-2 bg-blue-600 text-white rounded-md font-bold hover:bg-blue-700 transition-colors"
                >
                  Tag as Replicates
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};