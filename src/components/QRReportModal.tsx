"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { LabSample } from '../types';
import { X, Smartphone, Calculator, Printer, Info } from 'lucide-react';
import { BRAND_COLOR } from '@/lib/constants'; // Adjusted path to match standard Next.js

interface QRReportModalProps {
  samples: LabSample[];
  onClose: () => void;
  baseUrlOverride?: string;
  onBaseUrlChange?: (url: string) => void;
}

export const QRReportModal: React.FC<QRReportModalProps> = ({ samples, onClose, baseUrlOverride, onBaseUrlChange }) => {
  const [targetConc, setTargetConc] = useState<string>('');
  const [targetVol, setTargetVol] = useState<string>('');
  const [localBaseUrl, setLocalBaseUrl] = useState<string>('');
  const [mountTime, setMountTime] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setLocalBaseUrl(window.location.origin);
      setMountTime(new Date().toLocaleString());
    }
  }, []);

  const qrPayload = useMemo(() => {
    const summary = samples.map(s => {
      if (s.sampleType === 'cell-count') {
        const metrics = s.metadata?.cellCountData;
        return {
          type: 'cell',
          n: s.sampleName,
          t: metrics?.totalCells,
          v: metrics?.viability,
          d: metrics?.meanDiameter
        };
      }
      return {
        type: 'quant',
        n: s.sampleName,
        c: s.concentration,
        u: s.metadata?.unit || 'ng/uL',
        r1: s.ratios?.['260/280'],
        r2: s.ratios?.['260/230']
      };
    });

    const payload = { v: 1, ts: Math.floor(Date.now() / 1000), d: summary };
    const effectiveBaseUrl = baseUrlOverride || localBaseUrl;
    const dataStr = encodeURIComponent(JSON.stringify(payload));
    return `${effectiveBaseUrl}/mobile-report?import=${dataStr}`;
  }, [samples, baseUrlOverride, localBaseUrl]);

  const dilutionResults = useMemo(() => {
    if (!targetConc || !targetVol || samples.length === 0) return null;
    
    const c2 = parseFloat(targetConc);
    const v2 = parseFloat(targetVol);
    
    return samples.map(s => {
      const c1 = s.concentration || 0;
      if (c1 <= c2) return { name: s.sampleName, error: 'Stock conc too low' };
      
      const v1 = (c2 * v2) / c1;
      const vDiluent = v2 - v1;
      
      return {
        name: s.sampleName,
        v1: v1.toFixed(2),
        vDil: vDiluent.toFixed(2)
      };
    });
  }, [samples, targetConc, targetVol]);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 print:!static print:!block print:!bg-white print:!p-0 print:!z-auto print:!w-auto print:!h-auto print:!max-w-none print:!max-h-none print:!overflow-visible">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col md:flex-row max-h-[90vh] print:!max-h-none print:!shadow-none print:!block print:!w-full print:!border-none print:!overflow-visible print:!max-w-none print:!flex-none print:!h-auto print:!z-auto">
          
          {/* Left Side: QR Code */}
          <div className="p-8 bg-slate-50 border-r border-slate-100 flex flex-col items-center justify-center text-center w-full md:w-[350px] print:hidden">
            <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-200 mb-6">
              <QRCodeSVG 
                value={qrPayload} 
                size={220}
                level="M" 
                includeMargin={false}
              />
            </div>
            <div className="flex items-center gap-2 text-slate-800 font-bold mb-2">
              <Smartphone className="h-5 w-5 text-blue-600" />
              Scan to Mobile
            </div>
            <p className="text-xs text-slate-500 max-w-[240px]">
              Scan this code with your phone camera to import these {samples.length} results.
            </p>
          </div>

          {/* Right Side: Dilution Preview & Tools (THIS IS THE PRINTABLE AREA) */}
          <div id="printable-report" className="flex-1 p-8 overflow-y-auto print:!p-0 print:!overflow-visible print:!block print:!w-full print:!h-auto">
            
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Data Export Report</h2>
                <p className="text-sm text-slate-500">Summary Report & Dilution Planner</p>
              </div>
              
              {/* Header Buttons (Hidden during print) */}
              <div className="flex items-center gap-2 print:hidden">
                <button 
                  onClick={() => window.print()}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-bold transition-colors"
                >
                  <Printer className="h-4 w-4" />
                  Print
                </button>
                <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="h-5 w-5 text-slate-400" />
                </button>
              </div>
            </div>

            {/* Dilution Calculator Inputs */}
            <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100 mb-6 print:border-none print:p-0 print:mb-4">
              <div className="flex items-center gap-2 mb-4 text-blue-700 font-bold text-sm print:text-black print:mb-2">
                <Calculator className="h-4 w-4 print:hidden" /> 
                Dilution Parameters
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-blue-600 mb-1 print:text-gray-500">Target Conc (C₂)</label>
                  <input 
                    type="number" 
                    placeholder="e.g. 10"
                    className="w-full px-3 py-2 rounded-lg border border-blue-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none print:hidden"
                    value={targetConc}
                    onChange={(e) => setTargetConc(e.target.value)}
                  />
                  {/* Print-only display of the value */}
                  <div className="hidden print:block text-lg font-bold">
                    {targetConc || 'Not set'} {targetConc && samples[0]?.metadata?.unit}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-blue-600 mb-1 print:text-gray-500">Target Volume (V₂)</label>
                  <input 
                    type="number" 
                    placeholder="e.g. 50 µL"
                    className="w-full px-3 py-2 rounded-lg border border-blue-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none print:hidden"
                    value={targetVol}
                    onChange={(e) => setTargetVol(e.target.value)}
                  />
                  {/* Print-only display of the value */}
                  <div className="hidden print:block text-lg font-bold">
                    {targetVol || 'Not set'} {targetVol && 'µL'}
                  </div>
                </div>
              </div>
            </div>

            {/* Sample Table Preview */}
            <div className="space-y-3">
              <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-wider print:text-black">Report Details</h3>
              
              {dilutionResults ? dilutionResults.map((res: any, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl text-sm print:border-b print:border-gray-200 print:rounded-none print:px-0">
                  <span className="font-bold text-slate-700 truncate max-w-[200px] print:text-black">{res.name}</span>
                  {res.error ? (
                    <span className="text-red-500 text-xs font-medium print:text-black">{res.error}</span>
                  ) : (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded font-mono print:bg-transparent print:p-0 print:text-black">
                        Stock: <span className="font-bold">{res.v1}µL</span>
                      </span>
                      <span className="text-slate-300 print:text-black">+</span>
                      <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded font-mono print:bg-transparent print:p-0 print:text-black">
                        Buffer: <span className="font-bold">{res.vDil}µL</span>
                      </span>
                    </div>
                  )}
                </div>
              )) : samples.map(s => (
                <div key={s.id} className="flex justify-between p-3 bg-slate-50 border border-transparent rounded-xl text-sm print:border-b print:border-gray-200 print:bg-white print:rounded-none print:px-0">
                  <span className="font-medium text-slate-600 print:text-black">{s.sampleName}</span>
                  <span className="font-mono font-bold text-slate-800 print:text-black">
                    {s.concentration?.toFixed(1)} {s.metadata?.unit}
                  </span>
                </div>
              ))}
            </div>
            
            {/* Print Footer */}
            <div className="hidden print:block mt-12 text-center text-xs text-gray-400 border-t border-gray-200 pt-4">
              Generated by DeNovix Lab Vault • {mountTime}
            </div>

          </div>
        </div>
      </div>
  );
};