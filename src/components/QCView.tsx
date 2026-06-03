"use client";

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { LabSample } from '../types';
import { RatioDisplay } from './RatioDisplay';
import { ChevronLeft, CheckCircle2, AlertCircle, Printer } from 'lucide-react';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

interface QCViewProps {
  spectro: LabSample;
  fluor: LabSample;
  onBack: () => void;
}

export const QCView: React.FC<QCViewProps> = ({ spectro, fluor, onBack }) => {
  const stats = useMemo(() => {
    const absVal = spectro.concentration || 0;
    const fluorVal = fluor.concentration || 0;
    const delta = absVal - fluorVal;
    const percentDelta = (Math.abs(delta) / ((absVal + fluorVal) / 2)) * 100;
    return { absVal, fluorVal, delta, percentDelta };
  }, [spectro, fluor]);

  const plotData = useMemo(() => {
    if (!spectro.data) return [];

    // Find index of 260nm to plot the Fluor point relative to it
    const idx260 = spectro.data.wavelengths.findIndex(w => Math.round(w) === 260);
    const absAt260 = idx260 !== -1 ? spectro.data.absorbance[idx260] : 0;

    return [
      {
        x: spectro.data.wavelengths,
        y: spectro.data.absorbance,
        type: 'scatter',
        mode: 'lines',
        name: 'Absorbance Spectrum',
        line: { color: '#2563eb', width: 2 }
      },
      {
        x: [260],
        y: [absAt260],
        type: 'scatter',
        mode: 'markers',
        name: 'Abs @ 260nm',
        marker: { color: '#2563eb', size: 10, symbol: 'circle' }
      },
      {
        x: [260],
        y: [absAt260 * (stats.fluorVal / stats.absVal)], // Relative position
        type: 'scatter',
        mode: 'markers+text',
        name: 'Fluoro Conc',
        text: ['Fluoro Conc'],
        textposition: 'right',
        marker: { color: '#9333ea', size: 12, symbol: 'diamond' }
      }
    ];
  }, [spectro, stats]);

  return (
    <div className="space-y-6 print-full-width">
      <div className="flex justify-between items-center no-print">
        <button onClick={onBack} className="flex items-center gap-2 text-blue-600 font-medium hover:underline">
          <ChevronLeft className="h-4 w-4" /> Back to Dashboard
        </button>
        <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg font-bold hover:bg-slate-700 transition-colors">
          <Printer className="h-4 w-4" />
          Print PDF Report
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* QC Metrics Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{spectro.sampleName}</h2>
            <p className="text-sm text-slate-500 uppercase font-bold tracking-tighter">Integrated QC Report</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-xl">
              <div className="text-[10px] text-slate-400 font-bold uppercase">Absorbance</div>
              <div className="text-lg font-mono font-bold">{stats.absVal.toFixed(2)} <span className="text-xs font-normal">{spectro.metadata.unit}</span></div>
            </div>
            <div className="bg-purple-50 p-4 rounded-xl">
              <div className="text-[10px] text-purple-400 font-bold uppercase">Fluorescence</div>
              <div className="text-lg font-mono font-bold text-purple-700">{stats.fluorVal.toFixed(2)} <span className="text-xs font-normal">{fluor.metadata.unit}</span></div>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-100">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500 font-medium">260/280 Ratio</span>
              <RatioDisplay value={spectro.ratios?.['260/280']} alert={spectro.metadata['260/280 Alert']} />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500 font-medium">260/230 Ratio</span>
              <RatioDisplay value={spectro.ratios?.['260/230']} alert={spectro.metadata['260/230 Alert']} />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Delta (Abs - Fluor)</span>
              <span className="font-mono font-medium text-slate-700">{stats.delta.toFixed(2)} {spectro.metadata.unit}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">% Delta</span>
              <span className={`font-mono font-bold ${stats.percentDelta > 20 ? 'text-red-600' : 'text-emerald-600'}`}>
                {stats.percentDelta.toFixed(1)}%
              </span>
            </div>
          </div>

          <div className={`p-4 rounded-xl flex gap-3 ${stats.percentDelta < 20 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            {stats.percentDelta < 20 ? <CheckCircle2 className="shrink-0" /> : <AlertCircle className="shrink-0" />}
            <p className="text-xs leading-relaxed">
              {stats.percentDelta < 20 
                ? "Strong agreement between methods. Sample quantity and purity are verified." 
                : "High delta detected. This may indicate contamination or structural differences affecting Absorbance accuracy."}
            </p>
          </div>
        </div>

        {/* Graph Area */}
        <div className="lg:col-span-2 bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
          <Plot
            data={plotData}
            layout={{
              autosize: true,
              title: { text: 'Integrated QC Analysis', font: { size: 16 } },
              xaxis: { title: 'Wavelength (nm)', gridcolor: '#f1f5f9' },
              yaxis: { title: 'Absorbance (AU)', gridcolor: '#f1f5f9' },
              margin: { t: 40, b: 40, l: 50, r: 20 },
              legend: { orientation: 'h', y: -0.2 },
              plot_bgcolor: '#ffffff',
              paper_bgcolor: '#ffffff',
              annotations: [{
                x: 260, y: 0, xref: 'x', yref: 'y', text: '260nm peak', showarrow: true, arrowhead: 0, ax: 0, ay: -20
              }]
            }}
            useResizeHandler={true}
            className="w-full h-[500px]"
            config={{ displaylogo: false }}
          />
        </div>
      </div>
    </div>
  );
};