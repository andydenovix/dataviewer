"use client";

import React, { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { LabSample } from '../types';
import { Eye, EyeOff, CheckSquare, Square, Printer } from 'lucide-react';
import { parseScientificNum } from '../lib/utils';
import { BRAND_COLOR } from '../lib/constants';

// Plotly requires dynamic loading to work with Next.js SSR
const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

interface SpectralPlotProps {
  samples: LabSample[];
}

export const SpectralPlot: React.FC<SpectralPlotProps> = ({ samples }) => {
  const [averageMode, setAverageMode] = useState(false);
  const spectralSamples = useMemo(() => 
    samples.filter(s => s.sampleType !== 'image' && s.data), 
    [samples]
  );

  const [activeIds, setActiveIds] = useState<string[]>(
    spectralSamples.map(s => s.id!)
  );

  const toggleSample = (id: string) => {
    setActiveIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const showAll = () => setActiveIds(spectralSamples.map(s => s.id!));
  const hideAll = () => setActiveIds([]);

  const plotData = useMemo(() => {
    const activeSamples = spectralSamples.filter(s => activeIds.includes(s.id!));
    
    if (averageMode && activeSamples.length > 0) {
      // Group by replicateGroupId or just average everything selected
      const wavelengths = activeSamples[0].data!.wavelengths;
      const avgAbs = wavelengths.map((_, i) => {
        const values = activeSamples.map(s => s.data!.absorbance[i]);
        return values.reduce((a, b) => a + b) / values.length;
      });

      return [{
        x: wavelengths,
        y: avgAbs,
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: 'Averaged Trace',
        line: { width: 4, color: BRAND_COLOR },
        hovertemplate: `<b>Average</b><br>Wavelength: %{x} nm<br>Abs: %{y:.3f} AU<extra></extra>`
      }, 
      // Show individual traces as subtle background lines
      ...activeSamples.map(s => ({
        x: s.data!.wavelengths,
        y: s.data!.absorbance,
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: s.sampleName,
        line: { width: 1, color: 'rgba(148, 163, 184, 0.3)' },
        showlegend: false,
        hoverinfo: 'skip' as const
      }))];
    }

    const isFluor = spectralSamples.length > 0 && spectralSamples[0].sampleType === 'fluor';

    if (isFluor) {
      const activeSamples = spectralSamples.filter(s => activeIds.includes(s.id!));
      // Plot Samples as points
      const traces: any[] = activeSamples.map(s => ({
        x: [s.concentration],
        y: [s.rfu],
        mode: 'markers',
        type: 'scatter',
        name: s.sampleName,
        marker: { size: 10 },
        hovertemplate: `<b>${s.sampleName}</b><br>Conc: %{x}<br>RFU: %{y}<extra></extra>`
      }));

      // Extract standards from metadata of the first sample for the curve fit
      const first = activeSamples[0];
      if (first) {
        const stdX = [parseScientificNum(first.metadata['Std 1 value']), parseScientificNum(first.metadata['Std 2 value'])];
        const stdY = [parseScientificNum(first.metadata['Std 1 RFU average']), parseScientificNum(first.metadata['Std 2 RFU average'])];
        
        traces.push({
          x: stdX,
          y: stdY,
          mode: 'lines+markers',
          type: 'scatter',
          name: `Standards (${first.curveType})`,
          line: { dash: 'dash', color: '#94a3b8' },
          marker: { symbol: 'square-open', size: 12 }
        });
      }
      return traces;
    }

    return spectralSamples
      .filter(s => activeIds.includes(s.id!))
      .map(sample => ({
        x: sample.data!.wavelengths,
        y: sample.data!.absorbance,
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: sample.sampleName,
        hovertemplate: 
          `<b>${sample.sampleName}</b><br>` +
          `Wavelength: %{x} nm<br>` +
          `Abs: %{y:.3f} AU<br>` +
          `<br>` +
          `Conc: ${sample.concentration?.toFixed(2)} ${sample.metadata.unit}<br>` +
          `260/280: ${sample.ratios?.['260/280']?.toFixed(2) || 'N/A'}<br>` +
          `260/230: ${sample.ratios?.['260/230']?.toFixed(2) || 'N/A'}` +
          `<extra></extra>`,
      }));
  }, [spectralSamples, activeIds]);

  if (spectralSamples.length === 0) {
    return (
      <div className="p-12 text-center bg-white rounded-xl border border-slate-200 text-slate-500">
        None of the selected items contain spectral data to graph.
      </div>
    );
  }

  return (
    <div className="space-y-4 print-full-width">
      <div className="flex justify-end no-print">
        <button onClick={() => window.print()} className="flex items-center gap-2 text-slate-600 font-medium hover:text-blue-600 transition-colors">
          <Printer className="h-4 w-4" /> Print Visualization
        </button>
      </div>

    <div className="flex flex-col lg:flex-row gap-6">
      {/* Sample Sidebar */}
      <div className="w-full lg:w-72 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden h-[600px] no-print">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="font-semibold text-slate-700 text-sm">Visible Traces</h3>
          <div className="flex gap-2">
            <button 
              onClick={showAll}
              className="p-1 text-slate-400 hover:text-blue-600 transition-colors"
              title="Show All"
            >
              <CheckSquare className="h-4 w-4" />
            </button>
            <button 
              onClick={hideAll}
              className="p-1 text-slate-400 hover:text-red-600 transition-colors"
              title="Hide All"
            >
              <Square className="h-4 w-4" />
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {spectralSamples.map(sample => {
            const isActive = activeIds.includes(sample.id!);
            return (
              <button
                key={sample.id}
                onClick={() => toggleSample(sample.id!)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors
                  ${isActive 
                    ? 'bg-blue-50 text-blue-700 font-medium' 
                    : 'text-slate-500 hover:bg-slate-50'}`}
              >
                {isActive ? <Eye className="h-4 w-4 shrink-0" /> : <EyeOff className="h-4 w-4 shrink-0 opacity-40" />}
                <div className="truncate flex-1">
                  <div className="flex justify-between items-start gap-1">
                    <span className="truncate">{sample.sampleName}</span>
                    <span className="text-[10px] font-mono whitespace-nowrap bg-blue-100/50 px-1 rounded">{sample.concentration?.toFixed(1)}</span>
                  </div>
                  <div className="text-[10px] opacity-70 flex flex-wrap gap-x-2">
                    <span>{sample.application}</span>
                    {sample.ratios?.['260/280'] && <span>• 280: {sample.ratios['260/280'].toFixed(2)}</span>}
                    {sample.ratios?.['260/230'] && <span>• 230: {sample.ratios['260/230'].toFixed(2)}</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        
        <div className="p-3 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-400 text-center italic">
          {activeIds.length} of {spectralSamples.length} plotted
        </div>
      </div>

      {/* Graph Area */}
      <div className="flex-1 bg-white p-4 rounded-xl shadow-sm border border-slate-200 h-[600px]">
        <Plot
          data={plotData}
          layout={{
            autosize: true,
            title: { text: 'Absorbance Spectra', font: { size: 18, color: '#1e293b' } },
            xaxis: { title: 'Wavelength (nm)', gridcolor: '#f1f5f9', zeroline: false },
            yaxis: { title: 'Absorbance (AU)', gridcolor: '#f1f5f9', zeroline: false },
            hovermode: 'closest',
            margin: { t: 50, b: 50, l: 60, r: 20 },
            showlegend: true,
            legend: { orientation: 'h', y: -0.2 },
            plot_bgcolor: '#ffffff',
            paper_bgcolor: '#ffffff',
          }}
          useResizeHandler={true}
          className="w-full h-full"
          config={{ responsive: true, displaylogo: false }}
        />
      </div>
    </div>
    </div>
  );
};