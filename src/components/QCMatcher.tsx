"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, writeBatch } from 'firebase/firestore';
import { LabSample } from '../types';
import { Search, Link as LinkIcon, X, Info, Beaker, Sparkles, MousePointer2, ArrowRight, CheckCircle2 } from 'lucide-react';
import { BRAND_COLOR } from '@/lib/constants';

interface QCMatcherProps {
  samples: LabSample[];
  initialSelectedIds?: string[];
  onClose: () => void;
  onViewQC: (spectro: LabSample, fluor: LabSample) => void;
}

export const QCMatcher: React.FC<QCMatcherProps> = ({ 
  samples, 
  initialSelectedIds = [], 
  onClose, 
  onViewQC 
}) => {
  const [activeTab, setActiveTab] = useState<'smart' | 'manual'>('smart');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Manual selection state
  const [manualSpectro, setManualSpectro] = useState<LabSample | null>(null);
  const [manualFluor, setManualFluor] = useState<LabSample | null>(null);

  // Filter into methods
  const spectroPool = useMemo(() => samples.filter(s => s.sampleType === 'spectro'), [samples]);
  const fluorPool = useMemo(() => samples.filter(s => s.sampleType === 'fluor'), [samples]);

  // Pre-populate manual selection from dashboard selection
  useEffect(() => {
    if (initialSelectedIds.length > 0) {
      const selected = samples.filter(s => initialSelectedIds.includes(s.id!));
      const sMatch = selected.find(s => s.sampleType === 'spectro');
      const fMatch = selected.find(s => s.sampleType === 'fluor');
      
      if (sMatch) setManualSpectro(sMatch);
      if (fMatch) setManualFluor(fMatch);
      
      // Auto-switch to manual tab if a selection was made
      if (sMatch || fMatch) {
        setActiveTab('manual');
      }
    }
  }, [initialSelectedIds, samples]);

  // Identify potential matches based on name
  const suggestions = useMemo(() => 
    spectroPool.map(s => {
      const match = fluorPool.find(f => f.sampleName.toLowerCase().trim() === s.sampleName.toLowerCase().trim());
      return match ? { spectro: s, fluor: match } : null;
    }).filter(Boolean) as { spectro: LabSample; fluor: LabSample }[]
  , [spectroPool, fluorPool]);

  const handlePair = async (spectro: LabSample, fluor: LabSample) => {
    const pairId = `qc_${Date.now()}`;
    let pairName: string | null = null;
    let qcMatchScore: number | null = null; // Initialize QC Match Score

    // Calculate QC Match Score
    const concSpectro = spectro.concentration || 0;
    const concFluor = fluor.concentration || 0;

    if (concSpectro > 0 || concFluor > 0) { // Avoid division by zero if both are zero
      const averageConc = (concSpectro + concFluor) / 2;
      if (averageConc > 0) {
        qcMatchScore = (Math.abs(concSpectro - concFluor) / averageConc) * 100;
      }
    }
    
    if (spectro.sampleName !== fluor.sampleName) {
      const promptedName = window.prompt(
        `Samples have different names ("${spectro.sampleName}" vs "${fluor.sampleName}"). Enter a name for this matched pair:`, 
        spectro.sampleName
      );
      if (promptedName === null) return; // User cancelled
      pairName = promptedName.trim() || null;
    }

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'samples', spectro.id!), { pairedId: pairId, pairName, qcMatchScore });
      batch.update(doc(db, 'samples', fluor.id!), { pairedId: pairId, pairName, qcMatchScore });
      await batch.commit();
      
      // Pass updated sample objects to onViewQC
      onViewQC(
        { ...spectro, pairedId: pairId, pairName: pairName || undefined, qcMatchScore: qcMatchScore || undefined }, 
        { ...fluor, pairedId: pairId, pairName: pairName || undefined, qcMatchScore: qcMatchScore || undefined }
      );
    } catch (err) {
      console.error("Pairing failed", err);
    }
  };

  const filteredSpectro = spectroPool.filter(s => 
    s.sampleName.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredFluor = fluorPool.filter(s => 
    s.sampleName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 no-print">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-100 text-blue-600">
              <Beaker className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Method Pairing</h2>
              <p className="text-xs text-slate-500 font-medium">Verify Absorbance results against Fluorescence quantification</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex px-6 pt-4 gap-8 border-b border-slate-100 bg-white">
          <button 
            onClick={() => setActiveTab('smart')}
            className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${activeTab === 'smart' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            <Sparkles className="h-4 w-4" /> Smart Match
          </button>
          <button 
            onClick={() => setActiveTab('manual')}
            className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${activeTab === 'manual' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            <MousePointer2 className="h-4 w-4" /> Manual Matchup
          </button>
        </div>

        <div className="flex-1 overflow-hidden p-6 bg-slate-50/30">
          {activeTab === 'smart' ? (
            <div className="space-y-3 h-full overflow-y-auto pr-2">
              <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-4 flex items-center gap-2">
                <Info className="h-3 w-3" /> Automatic Name Correlation
              </h3>
              {suggestions.map((pair, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-blue-300 transition-all shadow-sm group">
                  <div className="flex items-center gap-8">
                    <div className="w-48">
                      <div className="text-[10px] text-blue-600 font-bold uppercase mb-1">Absorbance</div>
                      <div className="font-bold text-slate-800 truncate">{pair.spectro.sampleName}</div>
                    </div>
                    <div className="p-2 bg-blue-50 rounded-full text-blue-300">
                      <LinkIcon className="h-4 w-4" />
                    </div>
                    <div className="w-48">
                      <div className="text-[10px] text-purple-600 font-bold uppercase mb-1">Fluorescence</div>
                      <div className="font-bold text-slate-800 truncate">{pair.fluor.sampleName}</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => handlePair(pair.spectro, pair.fluor)}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors shadow-md shadow-blue-100"
                  >
                    Confirm & View
                  </button>
                </div>
              ))}
              {suggestions.length === 0 && (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                  <Sparkles className="h-12 w-12 mb-4 opacity-20" />
                  <p className="italic">No exact name matches found.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-12 gap-6 h-full">
              <div className="col-span-3 flex flex-col gap-3 h-full overflow-hidden">
                <h3 className="text-[10px] font-black uppercase text-blue-600 tracking-wider">Absorbance Pool</h3>
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filter..."
                    className="w-full pl-8 pr-3 py-1.5 border rounded-md text-xs focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="flex-1 overflow-y-auto space-y-1 pr-2">
                  {filteredSpectro.map(s => (
                    <button 
                      key={s.id} 
                      onClick={() => setManualSpectro(s)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg border text-xs transition-all ${manualSpectro?.id === s.id ? 'border-blue-500 bg-blue-50 text-blue-700 font-bold shadow-sm' : 'border-white bg-white hover:border-slate-200 text-slate-600 shadow-sm'}`}
                    >
                      {s.sampleName}
                    </button>
                  ))}
                </div>
              </div>

              <div className="col-span-6 flex flex-col gap-6 items-center justify-center bg-white rounded-2xl border border-slate-200 shadow-inner p-8">
                <div className="w-full max-w-sm space-y-6">
                  <div className={`p-4 rounded-xl border-2 transition-all flex items-center justify-between ${manualSpectro ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-slate-50 border-dashed border-slate-300'}`}>
                    <div>
                      <div className="text-[9px] font-bold text-blue-600 uppercase">Absorbance</div>
                      <div className={`text-sm font-bold ${manualSpectro ? 'text-slate-800' : 'text-slate-300'}`}>{manualSpectro?.sampleName || "Select from absorbance"}</div>
                    </div>
                    {manualSpectro && <button onClick={() => setManualSpectro(null)} className="p-1 hover:bg-blue-100 rounded text-blue-400"><X className="h-4 w-4" /></button>}
                  </div>
                  <div className="flex justify-center"><div className="p-2 bg-slate-100 rounded-full"><ArrowRight className="h-6 w-6 text-slate-400 rotate-90" /></div></div>
                  <div className={`p-4 rounded-xl border-2 transition-all flex items-center justify-between ${manualFluor ? 'bg-purple-50 border-purple-200 shadow-sm' : 'bg-slate-50 border-dashed border-slate-300'}`}>
                    <div>
                      <div className="text-[9px] font-bold text-purple-600 uppercase">Fluorescence</div>
                      <div className={`text-sm font-bold ${manualFluor ? 'text-slate-800' : 'text-slate-300'}`}>{manualFluor?.sampleName || "Select from fluorescence"}</div>
                    </div>
                    {manualFluor && <button onClick={() => setManualFluor(null)} className="p-1 hover:bg-purple-100 rounded text-purple-400"><X className="h-4 w-4" /></button>}
                  </div>
                </div>
                <button 
                  disabled={!manualSpectro || !manualFluor}
                  onClick={() => handlePair(manualSpectro!, manualFluor!)}
                  className="mt-8 px-10 py-3 text-white rounded-full font-bold disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 hover:opacity-90 transition-all hover:scale-105 active:scale-95 shadow-xl"
                  style={{ backgroundColor: BRAND_COLOR }}
                >
                  <CheckCircle2 className="h-5 w-5" /> Pair Selected Samples
                </button>
              </div>

              <div className="col-span-3 flex flex-col gap-3 h-full overflow-hidden">
                <h3 className="text-[10px] font-black uppercase text-purple-600 tracking-wider">Fluorescence Pool</h3>
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filter..."
                    className="w-full pl-8 pr-3 py-1.5 border rounded-md text-xs focus:ring-2 focus:ring-purple-500 outline-none bg-white"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="flex-1 overflow-y-auto space-y-1 pr-2">
                  {filteredFluor.map(f => (
                    <button 
                      key={f.id} 
                      onClick={() => setManualFluor(f)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg border text-xs transition-all ${manualFluor?.id === f.id ? 'border-purple-500 bg-purple-50 text-purple-700 font-bold shadow-sm' : 'border-white bg-white hover:border-slate-200 text-slate-600 shadow-sm'}`}
                    >
                      {f.sampleName}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 text-[9px] text-slate-400 text-center uppercase tracking-[0.2em] font-bold">
          Cross-method validation identifies potential contaminants or buffer interference in quantification
        </div>
      </div>
    </div>
  );
};