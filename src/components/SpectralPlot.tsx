"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { LabSample } from '../types';
import { Eye, EyeOff, CheckSquare, Square, Printer } from 'lucide-react';
import { parseScientificNum } from '../lib/utils';
import { BRAND_COLOR } from '../lib/constants';

interface SpectralPlotProps {
  samples: LabSample[];
}

export const SpectralPlot: React.FC<SpectralPlotProps> = ({ samples }) => {
  const [averageMode, setAverageMode] = useState(false);
  const plotDivRef = useRef<HTMLDivElement>(null); 

  const spectralSamples = useMemo(() => 
    samples.filter(s => s.sampleType !== 'image' && s.data && s.data.wavelengths?.length > 0), 
    [samples]
  );

  const [activeIds, setActiveIds] = useState<string[]>(
    spectralSamples.map(s => s.id!)
  );

  useEffect(() => {
    setActiveIds(spectralSamples.map(s => s.id!));
  }, [spectralSamples]);

  const toggleSample = (id: string) => {
    setActiveIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const showAll = () => setActiveIds(spectralSamples.map(s => s.id!));
  const hideAll = () => setActiveIds([]);

  const plotData = useMemo(() => {
    const activeSamples = spectralSamples.filter((s) =>
      activeIds.includes(s.id!)
    );
    
    const traces: any[] = [];

    if (activeSamples.length === 0) {
      return [];
    }

    const spectroSamples = activeSamples.filter((s) => s.data && s.data.wavelengths?.length > 0);
    const fluorSamples = activeSamples.filter(
      (s) => s.sampleType === 'fluor'
    );
    
    const hasSpectro = spectroSamples.length > 0;
    const hasFluor = fluorSamples.length > 0;

    if (averageMode) {
      if (spectroSamples.length > 0) {
        const wavelengths = spectroSamples[0].data!.wavelengths;
        const avgAbs = wavelengths.map((_, i) => {
          const values = spectroSamples.map((s) => s.data!.absorbance[i]);
          return values.reduce((a, b) => a + b) / values.length;
        });
        traces.push({
          x: wavelengths,
          y: avgAbs,
          type: 'scatter',
          mode: 'lines',
          name: 'Averaged Absorbance',
          line: { width: 4, color: BRAND_COLOR },
          yaxis: 'y',
          hovertemplate: `<b>Average Absorbance</b><br>Wavelength: %{x} nm<br>Abs: %{y:.3f} AU<extra></extra>`,
        });
        spectroSamples.forEach((s) => {
          traces.push({
            x: s.data!.wavelengths,
            y: s.data!.absorbance,
            type: 'scatter',
            mode: 'lines',
            name: s.sampleName,
            yaxis: 'y',
            line: { width: 1, color: 'rgba(148, 163, 184, 0.3)' },
            showlegend: false,
            hoverinfo: 'skip',
          });
        });
      }

      if (fluorSamples.length > 0) {
        fluorSamples.forEach((s) => {
          traces.push({
            x: [s.concentration],
            y: [s.rfu],
            mode: 'markers',
            type: 'scatter',
            name: s.sampleName,
            marker: { size: 10, color: 'purple' },
            hovertemplate: `<b>${s.sampleName}</b><br>Conc: %{x}<br>RFU: %{y}<extra></extra>`,
          });
        });
        const firstFluor = fluorSamples[0];
        if (firstFluor) {
          const stdX = [
            parseScientificNum(firstFluor.metadata['Std 1 value']),
            parseScientificNum(firstFluor.metadata['Std 2 value']),
          ];
          const stdY = [
            parseScientificNum(firstFluor.metadata['Std 1 RFU average']),
            parseScientificNum(firstFluor.metadata['Std 2 RFU average']),
          ];
          if (stdX[0] !== null && stdY[0] !== null && stdX[1] !== null && stdY[1] !== null) {
            traces.push({
              x: stdX,
              y: stdY,
              mode: 'lines+markers',
              type: 'scatter',
              name: `Standards (${firstFluor.curveType})`,
              yaxis: hasSpectro ? 'y2' : 'y',
              line: { dash: 'dash', color: '#9333ea' },
              marker: { symbol: 'square-open', size: 12 },
            });
          }
        }
      }
    } else {
      activeSamples.forEach((sample) => {
        if (sample.data && sample.data.wavelengths?.length > 0) {
          traces.push({
            x: sample.data.wavelengths,
            y: sample.data.absorbance,
            type: 'scatter',
            mode: 'lines',
            name: sample.sampleName,
            yaxis: 'y',
            line: { width: 2.5 },
            hovertemplate: 
            `<b>${sample.sampleName}</b><br>` +
            `Wavelength: %{x} nm<br>` +
            `Abs: %{y:.3f} AU<br>` +
            `<br>` +
            `Conc: ${sample.concentration?.toFixed(2)} ${sample.metadata.unit}<br>` +
            `260/280: ${sample.ratios?.['260/280']?.toFixed(2) || 'N/A'}<br>` +
            `260/230: ${sample.ratios?.['260/230']?.toFixed(2) || 'N/A'}` +
            `<extra></extra>`,
          });
        } else if (sample.sampleType === 'fluor') {
          traces.push({
            x: [sample.concentration],
            y: [sample.rfu],
            mode: 'markers',
            type: 'scatter',
            name: sample.sampleName,
            marker: { size: 10, line: { width: 1, color: 'white' } },
            yaxis: hasSpectro ? 'y2' : 'y',
            hovertemplate: `<b>${sample.sampleName}</b><br>Conc: %{x}<br>RFU: %{y}<extra></extra>`,
          });
          const stdX = [
            parseScientificNum(sample.metadata['Std 1 value']),
            parseScientificNum(sample.metadata['Std 2 value']),
          ];
          const stdY = [
            parseScientificNum(sample.metadata['Std 1 RFU average']),
            parseScientificNum(sample.metadata['Std 2 RFU average']),
          ];
          if (stdX[0] !== null && stdY[0] !== null && stdX[1] !== null && stdY[1] !== null) {
            traces.push({
              x: stdX,
              y: stdY,
              mode: 'lines+markers',
              type: 'scatter',
              name: `Standards (${sample.curveType}) - ${sample.sampleName}`,
              yaxis: hasSpectro ? 'y2' : 'y',
              line: { dash: 'dash', color: '#94a3b8' },
              marker: { symbol: 'square-open', size: 12 },
              showlegend: false, 
            });
          }
        }
      });
    }

    return traces;
  }, [spectralSamples, activeIds, averageMode, BRAND_COLOR]);

  // FIX: Safe layout generation that prevents the 'anchor' crash
  const plotLayout = useMemo(() => {
    const activeSamples = spectralSamples.filter(s => activeIds.includes(s.id!));
    
    // Perfectly matches the trace logic to know if we actually need the axes
    const hasSpectro = activeSamples.some(s => s.data && s.data.wavelengths?.length > 0);
    const hasFluor = activeSamples.some(s => s.sampleType === 'fluor');

    let xTitle = 'Wavelength (nm)';
    let yTitle = 'Absorbance (AU)';

    if (hasFluor && !hasSpectro) {
      xTitle = 'Concentration';
      yTitle = 'RFU (Fluorescence)';
    } else if (hasFluor && hasSpectro) {
      xTitle = 'Mixed Scale (Wavelength/Conc)';
    }

    // Base layout without a secondary axis
    const layout: any = {
      autosize: true,
      title: { 
        text: averageMode ? 'Averaged Analytical Data' : 'Sample Visualization', 
        font: { size: 18, color: '#1e293b' } 
      },
      xaxis: { title: xTitle, gridcolor: '#f1f5f9', zeroline: false },
      yaxis: { 
        title: yTitle, 
        gridcolor: '#f1f5f9', 
        zeroline: false,
        side: 'left'
      },
      hovermode: 'closest',
      margin: { t: 60, b: 60, l: 60, r: hasFluor && hasSpectro ? 60 : 20 },
      showlegend: true,
      legend: { orientation: 'h', y: -0.2 },
      plot_bgcolor: '#ffffff',
      paper_bgcolor: '#ffffff',
    };

    // Safely attach the secondary axis ONLY if we actually need it
    if (hasFluor && hasSpectro) {
      layout.yaxis2 = {
        title: 'RFU (Fluorescence)',
        overlaying: 'y',
        side: 'right',
        showgrid: false
      };
    }

    return layout;
  }, [spectralSamples, activeIds, averageMode]);

  useEffect(() => {
    let isMounted = true;
    let Plotly: any;

    const renderPlot = async () => {
      if (!plotDivRef.current || plotData.length === 0) return;

      try {
        Plotly = (await import('plotly.js')).default;
        
        if (isMounted && plotDivRef.current) {
          Plotly.newPlot(plotDivRef.current, plotData, plotLayout, { 
            responsive: true, 
            displaylogo: false 
          });
        }
      } catch (error) {
        console.error("Failed to load or render Plotly:", error);
      }
    };

    renderPlot();

    return () => {
      isMounted = false;
      if (plotDivRef.current && Plotly) {
        Plotly.purge(plotDivRef.current);
      }
    };
  }, [plotData, plotLayout]);

  if (spectralSamples.length === 0) {
    return (
      <div className="p-12 text-center bg-white rounded-xl border border-slate-200 text-slate-500">
        None of the selected items contain spectral data to graph.
      </div>
    );
  }

  return (
    <div className="space-y-4 print-full-width">
      <div className="flex justify-end items-center gap-4 no-print">
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={averageMode}
            onChange={() => setAverageMode(!averageMode)}
          />
          <div className="relative w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
          <span className="ms-3 text-sm font-medium text-gray-900 dark:text-gray-300">Average Mode</span>
        </label>
        <button onClick={() => window.print()} className="flex items-center gap-2 text-slate-600 font-medium hover:text-blue-600 transition-colors">
          <Printer className="h-4 w-4" /> Print Visualization
        </button>
      </div>

    <div className="flex flex-col lg:flex-row gap-6">
      <div className="w-full lg:w-72 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden h-[600px] no-print">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between print-hidden">
          <h3 className="font-semibold text-slate-700 text-sm">Visible Traces</h3>
          <div className="flex gap-2">
            <button onClick={showAll} className="p-1 text-slate-400 hover:text-blue-600 transition-colors" title="Show All">
              <CheckSquare className="h-4 w-4" />
            </button>
            <button onClick={hideAll} className="p-1 text-slate-400 hover:text-red-600 transition-colors" title="Hide All">
              <Square className="h-4 w-4" />
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1 print-hidden">
          {spectralSamples.map(sample => {
            const isActive = activeIds.includes(sample.id!);
            return (
              <button
                key={sample.id}
                onClick={() => toggleSample(sample.id!)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors
                  ${isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-500 hover:bg-slate-50'}`}
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

        <div className="p-3 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-400 text-center italic print-hidden">
          {activeIds.length} of {spectralSamples.length} plotted
        </div>
      </div>

      <div className="flex-1 bg-white p-4 rounded-xl shadow-sm border border-slate-200 h-[600px]">
        <div ref={plotDivRef} className="w-full h-full" style={{ minHeight: '500px' }} />
      </div>
    </div>
    </div>
  );
};