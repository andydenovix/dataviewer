"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { LabSample, ReferenceSpectrum } from '../types';
import { BRAND_COLOR } from '@/lib/constants';
import { addReferenceSpectrum, removeReferenceSpectrum } from '@/lib/referenceSpectraService';
import { computeSpectralScore, detectAnomalies, buildOverlapGrid, interpolateToGrid } from '@/lib/spectralAnalysis';
import type { SpectralScore } from '@/lib/spectralAnalysis';
import { ArrowLeft, Scan, BookOpen, BarChart2, Plus, Trash2, CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronRight, Minus } from 'lucide-react';

type Tab = 'library' | 'analysis';

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SpectralScore['overallStatus'] }) {
  if (status === 'pass')    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700"><CheckCircle className="h-3 w-3" /> PASS</span>;
  if (status === 'warn')    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700"><AlertTriangle className="h-3 w-3" /> WARN</span>;
  if (status === 'fail')    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-red-50 text-red-700"><XCircle className="h-3 w-3" /> FAIL</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-400"><Minus className="h-3 w-3" /> —</span>;
}

function SimilarityBar({ value }: { value: number }) {
  const pct = Math.round(value * 1000) / 10; // 0-100.0
  const color = value >= 0.99 ? '#10b981' : value >= 0.97 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-mono font-bold" style={{ color }}>{pct.toFixed(1)}%</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface SpectralFingerprintPanelProps {
  userId: string;
  samples: LabSample[];
  referenceSpectra: ReferenceSpectrum[];
  onClose: () => void;
}

export const SpectralFingerprintPanel: React.FC<SpectralFingerprintPanelProps> = ({
  userId, samples, referenceSpectra, onClose,
}) => {
  const [tab, setTab]               = useState<Tab>('library');
  const [selectedApp, setSelectedApp] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adding, setAdding]         = useState<Set<string>>(new Set());
  const [removing, setRemoving]     = useState<Set<string>>(new Set());

  const plotRef    = useRef<HTMLDivElement>(null);
  const plotlyRef  = useRef<any>(null);

  // Escape to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  // Cleanup Plotly on unmount
  useEffect(() => () => {
    if (plotRef.current && plotlyRef.current) plotlyRef.current.purge(plotRef.current);
  }, []);

  // All spectro samples with spectral data
  const spectroSamples = useMemo(
    () => samples.filter(s => s.sampleType === 'spectro' && (s.data?.wavelengths?.length ?? 0) > 0),
    [samples]
  );

  // All distinct applications across samples + references
  const applications = useMemo(() => {
    const apps = new Set<string>();
    spectroSamples.forEach(s => s.application && apps.add(s.application));
    referenceSpectra.forEach(r => apps.add(r.application));
    return Array.from(apps).sort();
  }, [spectroSamples, referenceSpectra]);

  // Auto-select first application
  useEffect(() => {
    if (!selectedApp && applications.length > 0) setSelectedApp(applications[0]);
  }, [applications, selectedApp]);

  // References for the selected application
  const appRefs = useMemo(
    () => referenceSpectra.filter(r => r.application === selectedApp),
    [referenceSpectra, selectedApp]
  );

  // Spectro samples of this application not already in reference library
  const candidateSamples = useMemo(
    () => spectroSamples.filter(s =>
      s.application === selectedApp && !referenceSpectra.some(r => r.sampleId === s.id)
    ),
    [spectroSamples, selectedApp, referenceSpectra]
  );

  // Analysis results for all spectro samples of this application
  const analysisRows = useMemo(() => {
    const refList = appRefs.map(r => ({
      sampleName: r.sampleName,
      wavelengths: r.wavelengths,
      absorbance:  r.absorbance,
    }));
    return spectroSamples
      .filter(s => s.application === selectedApp)
      .map(s => ({
        sample: s,
        score: computeSpectralScore(s.data!.wavelengths, s.data!.absorbance, refList),
      }));
  }, [spectroSamples, selectedApp, appRefs]);

  const analysisStats = useMemo(() => ({
    pass: analysisRows.filter(r => r.score.overallStatus === 'pass').length,
    warn: analysisRows.filter(r => r.score.overallStatus === 'warn').length,
    fail: analysisRows.filter(r => r.score.overallStatus === 'fail').length,
    noData: analysisRows.filter(r => r.score.overallStatus === 'no-data').length,
  }), [analysisRows]);

  // ── Plotly reference overlay ──────────────────────────────────────────────

  useEffect(() => {
    if (tab !== 'library' || !plotRef.current || appRefs.length === 0) return;
    let mounted = true;
    (async () => {
      if (!plotlyRef.current) plotlyRef.current = (await import('plotly.js')).default;
      if (!mounted || !plotRef.current) return;

      const COLORS = ['#3368c6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4'];
      const traces: any[] = appRefs.map((ref, i) => ({
        x: ref.wavelengths,
        y: ref.absorbance,
        mode: 'lines',
        type: 'scatter',
        name: ref.sampleName,
        line: { color: COLORS[i % COLORS.length], width: 2, opacity: 0.8 },
        hovertemplate: `<b>${ref.sampleName}</b><br>λ: %{x} nm<br>A: %{y:.4f}<extra></extra>`,
      }));

      // Add mean reference if > 1
      if (appRefs.length > 1) {
        const grid = buildOverlapGrid(appRefs.map(r => ({ wavelengths: r.wavelengths })));
        if (grid.length > 0) {
          const meanAbs = grid.map((_, gi) => {
            const sum = appRefs.reduce((acc, r) => acc + interpolateToGrid(r.wavelengths, r.absorbance, [grid[gi]])[0], 0);
            return sum / appRefs.length;
          });
          traces.push({
            x: grid, y: meanAbs, mode: 'lines', type: 'scatter', name: 'Mean reference',
            line: { color: '#1e293b', width: 2.5, dash: 'dot' },
            hovertemplate: 'Mean<br>λ: %{x} nm<br>A: %{y:.4f}<extra></extra>',
          });
        }
      }

      plotlyRef.current.react(plotRef.current, traces, {
        autosize: true,
        uirevision: `ref-${selectedApp}`,
        xaxis: { title: 'Wavelength (nm)', gridcolor: '#f1f5f9' },
        yaxis: { title: 'Absorbance', gridcolor: '#f1f5f9', zeroline: false },
        hovermode: 'closest',
        margin: { t: 20, b: 50, l: 60, r: 20 },
        legend: { orientation: 'h', y: -0.25 },
        plot_bgcolor: '#ffffff', paper_bgcolor: '#ffffff',
      }, { responsive: true, displaylogo: false });
    })();
    return () => { mounted = false; };
  }, [appRefs, tab, selectedApp]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleAddReference = useCallback(async (s: LabSample) => {
    if (!s.id || !s.data) return;
    setAdding(prev => new Set(prev).add(s.id!));
    try {
      await addReferenceSpectrum(userId, {
        sampleId:    s.id,
        sampleName:  s.sampleName,
        application: s.application,
        wavelengths: s.data.wavelengths,
        absorbance:  s.data.absorbance,
      });
    } finally {
      setAdding(prev => { const next = new Set(prev); next.delete(s.id!); return next; });
    }
  }, [userId]);

  const handleRemoveReference = useCallback(async (ref: ReferenceSpectrum) => {
    if (!ref.id) return;
    setRemoving(prev => new Set(prev).add(ref.id!));
    try {
      await removeReferenceSpectrum(ref.id);
    } finally {
      setRemoving(prev => { const next = new Set(prev); next.delete(ref.id!); return next; });
    }
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 px-6 py-4 flex flex-wrap items-center gap-3 shrink-0">
        <button onClick={onClose} className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </button>
        <div className="w-px h-5 bg-slate-200" />
        <Scan className="h-5 w-5" style={{ color: BRAND_COLOR }} />
        <h1 className="text-base font-bold text-slate-900 mr-auto">Spectral Fingerprinting & Anomaly Detection</h1>

        {/* Application selector */}
        {applications.length > 0 && (
          <select
            value={selectedApp}
            onChange={e => setSelectedApp(e.target.value)}
            className="px-3 py-1.5 border rounded-lg text-sm bg-white outline-none font-medium"
          >
            {applications.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}

        {/* Tab switcher */}
        <div className="flex rounded-lg border overflow-hidden text-sm">
          <button
            onClick={() => setTab('library')}
            className={`flex items-center gap-1.5 px-3 py-1.5 font-bold transition-colors ${tab === 'library' ? 'text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            style={tab === 'library' ? { backgroundColor: BRAND_COLOR } : {}}
          >
            <BookOpen className="h-3.5 w-3.5" /> Reference Library
          </button>
          <button
            onClick={() => setTab('analysis')}
            className={`flex items-center gap-1.5 px-3 py-1.5 font-bold transition-colors ${tab === 'analysis' ? 'text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            style={tab === 'analysis' ? { backgroundColor: BRAND_COLOR } : {}}
          >
            <BarChart2 className="h-3.5 w-3.5" /> Batch Analysis
            {(analysisStats.warn + analysisStats.fail) > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-black">
                {analysisStats.warn + analysisStats.fail}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* No applications state */}
      {applications.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-center text-slate-400">
          <div>
            <Scan className="h-16 w-16 mx-auto mb-4 opacity-20" />
            <p className="font-semibold text-slate-500">No spectrophotometry samples loaded</p>
            <p className="text-sm mt-1">Upload samples with spectral data to use fingerprinting</p>
          </div>
        </div>
      )}

      {/* ── Library tab ──────────────────────────────────────────────────────── */}
      {tab === 'library' && applications.length > 0 && (
        <div className="flex flex-1 overflow-hidden">
          {/* Plot */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden p-4">
            {appRefs.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                <div>
                  <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-25" />
                  <p className="font-semibold text-slate-500">No reference spectra for {selectedApp}</p>
                  <p className="text-sm mt-1">Add samples from the list on the right to build the library</p>
                </div>
              </div>
            ) : (
              <>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                  Reference Overlay — {appRefs.length} spectrum{appRefs.length !== 1 ? 'a' : ''}
                </p>
                <div ref={plotRef} className="flex-1 min-h-0" style={{ minHeight: 280 }} />
              </>
            )}
          </div>

          {/* Sidebar: manage references */}
          <div className="w-80 border-l border-slate-200 flex flex-col shrink-0">
            {/* Stored references */}
            <div className="flex-1 overflow-y-auto">
              {appRefs.length > 0 && (
                <div className="p-3 border-b border-slate-100">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Stored References</p>
                  <div className="space-y-1">
                    {appRefs.map(ref => (
                      <div key={ref.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-700 truncate">{ref.sampleName}</p>
                          <p className="text-[10px] text-slate-400">{ref.wavelengths.length} pts</p>
                        </div>
                        <button
                          onClick={() => handleRemoveReference(ref)}
                          disabled={removing.has(ref.id!)}
                          className="p-1 text-slate-300 hover:text-red-500 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Candidates to add */}
              <div className="p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                  Add from Loaded Samples
                </p>
                {candidateSamples.length === 0 ? (
                  <p className="text-xs text-slate-400 py-2">
                    {spectroSamples.filter(s => s.application === selectedApp).length === 0
                      ? `No ${selectedApp} spectro samples loaded`
                      : 'All loaded samples are already in the library'}
                  </p>
                ) : (
                  <div className="space-y-1">
                    {candidateSamples.map(s => (
                      <div key={s.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 rounded-lg group">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-600 truncate">{s.sampleName}</p>
                          <p className="text-[10px] text-slate-400">{s.data!.wavelengths.length} pts · {s.concentration?.toFixed(1)} {s.metadata.unit}</p>
                        </div>
                        <button
                          onClick={() => handleAddReference(s)}
                          disabled={adding.has(s.id!)}
                          className="flex items-center gap-1 px-2 py-1 text-xs font-bold rounded border transition-colors disabled:opacity-50"
                          style={{ color: BRAND_COLOR, borderColor: `${BRAND_COLOR}44`, backgroundColor: `${BRAND_COLOR}08` }}
                        >
                          <Plus className="h-3 w-3" />
                          {adding.has(s.id!) ? '…' : 'Add'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Usage hint */}
            <div className="p-3 border-t border-slate-100 bg-blue-50/60">
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Reference spectra define the expected spectral shape for {selectedApp} samples.
                New uploads are compared against this library — samples with cosine similarity &lt;0.99 are flagged for review.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Analysis tab ─────────────────────────────────────────────────────── */}
      {tab === 'analysis' && applications.length > 0 && (
        <div className="flex-1 overflow-y-auto p-6">
          {/* Stats */}
          <div className="flex flex-wrap gap-4 mb-5">
            {[
              { label: 'Pass',        value: analysisStats.pass,   color: 'text-emerald-600' },
              { label: 'Warning',     value: analysisStats.warn,   color: 'text-amber-600'   },
              { label: 'Fail',        value: analysisStats.fail,   color: 'text-red-600'     },
              { label: 'No ref data', value: analysisStats.noData, color: 'text-slate-300'   },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <p className={`text-3xl font-black ${color}`}>{value}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
              </div>
            ))}
            {appRefs.length === 0 && (
              <div className="ml-4 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                No reference spectra — shape checks only. Add references in the Library tab for similarity scoring.
              </div>
            )}
          </div>

          {analysisRows.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Scan className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="font-semibold">No {selectedApp} samples with spectral data</p>
            </div>
          ) : (
            <div className="space-y-1">
              {analysisRows.map(({ sample, score }) => {
                const isExpanded = expandedId === sample.id;
                const hasIssues  = score.anomalyFlags.length > 0 || (score.referenceCount > 0 && score.cosineSimilarity < 0.99);
                return (
                  <div
                    key={sample.id}
                    className={`border rounded-xl overflow-hidden transition-colors ${
                      isExpanded ? 'border-slate-300' : 'border-slate-100'
                    } ${hasIssues ? 'bg-white' : 'bg-slate-50/40'}`}
                  >
                    {/* Row */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : sample.id!)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/80 transition-colors"
                    >
                      <StatusBadge status={score.overallStatus} />

                      <span className="flex-1 font-semibold text-slate-700 text-sm truncate">{sample.sampleName}</span>

                      {score.referenceCount > 0 && score.cosineSimilarity > 0 && (
                        <SimilarityBar value={score.cosineSimilarity} />
                      )}

                      {score.anomalyFlags.length > 0 && (
                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                          {score.anomalyFlags.length} flag{score.anomalyFlags.length !== 1 ? 's' : ''}
                        </span>
                      )}

                      {score.bestReferenceMatch && score.cosineSimilarity < 0.99 && (
                        <span className="text-[10px] text-slate-400 hidden sm:block">
                          vs. {score.bestReferenceMatch}
                        </span>
                      )}

                      {isExpanded
                        ? <ChevronDown  className="h-4 w-4 text-slate-400 shrink-0" />
                        : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-slate-100">
                        {/* Reference scores */}
                        {score.referenceScores.length > 0 && (
                          <div className="mt-3 mb-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Similarity to References</p>
                            <div className="space-y-1.5">
                              {score.referenceScores.map(rs => (
                                <div key={rs.name} className="flex items-center gap-3">
                                  <span className="text-xs text-slate-600 w-40 truncate">{rs.name}</span>
                                  <SimilarityBar value={rs.similarity} />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Anomaly flags */}
                        {score.anomalyFlags.length === 0 && score.referenceCount > 0 && score.cosineSimilarity >= 0.99 && (
                          <div className="mt-3 flex items-center gap-2 text-sm text-emerald-600">
                            <CheckCircle className="h-4 w-4" />
                            <span className="font-semibold">Spectrum matches reference library — no issues detected</span>
                          </div>
                        )}

                        {score.anomalyFlags.map((flag, fi) => (
                          <div
                            key={fi}
                            className={`mt-3 rounded-lg p-3 border-l-4 ${
                              flag.severity === 'fail'
                                ? 'bg-red-50 border-red-500'
                                : 'bg-amber-50 border-amber-400'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              {flag.severity === 'fail'
                                ? <XCircle      className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                                : <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />}
                              <div>
                                <p className="text-sm font-bold text-slate-800">
                                  {flag.name}
                                  <span className="ml-2 text-[10px] font-black text-slate-400 uppercase tracking-wide">{flag.wavelengthRegion}</span>
                                </p>
                                <p className="text-xs text-slate-600 mt-0.5">{flag.description}</p>
                                <div className="mt-2 pt-2 border-t border-slate-200/60">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Likely cause & remediation</p>
                                  <p className="text-xs text-slate-700 leading-relaxed">{flag.likelyCause}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
