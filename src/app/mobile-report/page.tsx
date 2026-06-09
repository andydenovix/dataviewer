"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Calculator, Loader2 } from 'lucide-react';
import { BRAND_COLOR } from '@/lib/constants';

// Define types for the parsed QR data
interface SummaryQuantSample {
  type: 'quant';
  n: string; // sampleName
  c: number | undefined; // concentration
  u: string; // unit
  r1: number | undefined; // 260/280
  r2: number | undefined; // 260/230
}

interface SummaryCellSample {
  type: 'cell';
  n: string; // sampleName
  t: number | undefined; // totalCells
  v: number | undefined; // viability
  d: number | undefined; // MeanDiameter
}

type QRParsedSample = SummaryQuantSample | SummaryCellSample;

interface QRDataPayload {
  v: number; // version
  ts: number; // timestamp (Unix epoch seconds)
  d: QRParsedSample[]; // data
}

export default function MobileReportPage() {
  const searchParams = useSearchParams();
  const [parsedData, setParsedData] = useState<QRDataPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [targetConc, setTargetConc] = useState<string>('');
  const [targetVol, setTargetVol] = useState<string>('');

  useEffect(() => {
    const importData = searchParams.get('import');
    if (importData) {
      try {
        const decodedData = JSON.parse(decodeURIComponent(importData));
        // Basic validation
        if (decodedData && decodedData.v === 1 && Array.isArray(decodedData.d)) {
          setParsedData(decodedData);
        } else {
          setError('Invalid data format in QR code payload.');
        }
      } catch (e) {
        console.error("Error parsing QR data:", e);
        setError('Failed to parse QR code data. It might be corrupted or invalid.');
      }
    } else {
      setError('No data found in QR code URL. Please scan a valid DeNovix QR code.');
    }
  }, [searchParams]);

  const dilutionResults = useMemo(() => {
    if (!targetConc || !targetVol || !parsedData || parsedData.d.length === 0) return null;
    
    const c2 = parseFloat(targetConc);
    const v2 = parseFloat(targetVol);
    
    return parsedData.d.map(s => {
      // Only quantify samples with concentration data (quant type)
      if (s.type !== 'quant' || s.c === undefined || s.c === null) {
        return { name: s.n, error: 'N/A (Not a quant sample)' };
      }
      
      const c1 = s.c || 0;
      if (c1 <= 0) return { name: s.n, error: 'Stock conc is zero' };
      if (c1 <= c2) return { name: s.n, error: 'Stock conc too low' };
      
      const v1 = (c2 * v2) / c1;
      const vDiluent = v2 - v1;
      
      return {
        name: s.n,
        v1: v1.toFixed(2),
        vDil: vDiluent.toFixed(2)
      };
    });
  }, [parsedData, targetConc, targetVol]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4 text-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
          <p className="text-slate-700">{error}</p>
          <p className="text-sm text-slate-500 mt-4">Please ensure you scanned a valid DeNovix QR code.</p>
        </div>
      </div>
    );
  }

  if (!parsedData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4 text-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
          <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-slate-700">Loading report data...</p>
        </div>
      </div>
    );
  }

  const generatedAt = new Date(parsedData.ts * 1000).toLocaleString();

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 md:p-8">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 bg-blue-600 text-white">
          <h1 className="text-2xl font-bold">DeNovix Mobile Report</h1>
          <p className="text-sm opacity-90 mt-1">Generated: {generatedAt}</p>
        </div>

        <div className="p-5 space-y-6">
          {/* Dilution Calculator Inputs */}
          <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100">
            <div className="flex items-center gap-2 mb-4 text-blue-700 font-bold text-sm">
              <Calculator className="h-4 w-4" /> 
              Dilution Planner (C₁V₁ = C₂V₂)
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-blue-600 mb-1">Target Conc (C₂)</label>
                <input 
                  type="number" 
                  placeholder="e.g. 10"
                  className="w-full px-3 py-2 rounded-lg border border-blue-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  value={targetConc}
                  onChange={(e) => setTargetConc(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-blue-600 mb-1">Target Volume (V₂)</label>
                <input 
                  type="number" 
                  placeholder="e.g. 50 µL"
                  className="w-full px-3 py-2 rounded-lg border border-blue-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  value={targetVol}
                  onChange={(e) => setTargetVol(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Sample List */}
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-slate-800">Sample Summary ({parsedData.d.length})</h2>
            {dilutionResults ? dilutionResults.map((res: any, i) => (
              <div key={i} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 bg-white border border-slate-200 rounded-xl text-sm">
                <span className="font-bold text-slate-700 truncate max-w-[200px] mb-1 sm:mb-0">{res.name}</span>
                {res.error ? (
                  <span className="text-red-500 text-xs font-medium">{res.error}</span>
                ) : (
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded font-mono">
                      Stock: <span className="font-bold">{res.v1}µL</span>
                    </span>
                    <span className="text-slate-300">+</span>
                    <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded font-mono">
                      Buffer: <span className="font-bold">{res.vDil}µL</span>
                    </span>
                  </div>
                )}
              </div>
            )) : parsedData.d.map((s, i) => (
              <div key={i} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm">
                <span className="font-medium text-slate-600 truncate max-w-[200px] mb-1 sm:mb-0">{s.n}</span>
                {s.type === 'quant' ? (
                  <div className="font-mono font-bold text-slate-800">
                    {s.c?.toFixed(1)} {s.u}
                    {s.r1 && <span className="ml-2 text-slate-500">260/280: {s.r1.toFixed(2)}</span>}
                    {s.r2 && <span className="ml-2 text-slate-500">260/230: {s.r2.toFixed(2)}</span>}
                  </div>
                ) : (
                  <div className="font-mono font-bold text-slate-800">
                    Total: {s.t?.toLocaleString()} | Viability: {s.v?.toFixed(1)}%
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}