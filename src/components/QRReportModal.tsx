"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { LabSample } from '../types';
import { X, Smartphone, Calculator, Printer, Info, Download, LayoutGrid, List, AlertTriangle, CheckCircle } from 'lucide-react';
import { BRAND_COLOR } from '@/lib/constants';

// ── Types ─────────────────────────────────────────────────────────────────────

type Mode = 'summary' | 'planner';
type PlateFormat = '96' | '48' | '24' | 'tube';

interface PlannerRow {
  well: string;
  name: string;
  c1: number;
  c2: number;
  v2: number;
  v1: number | null;
  vd: number | null;
  status: 'ok' | 'warn-low-vol' | 'too-dilute' | 'no-stock' | 'incomplete';
}

interface PerSampleOverride {
  c2: string;
  v2: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PLATE_CONFIGS: Record<PlateFormat, { rows: number; cols: number; label: string }> = {
  '96':   { rows: 8,  cols: 12, label: '96-well' },
  '48':   { rows: 6,  cols: 8,  label: '48-well' },
  '24':   { rows: 4,  cols: 6,  label: '24-well' },
  'tube': { rows: 0,  cols: 0,  label: 'Tubes'   },
};

function generateWellPositions(n: number, format: PlateFormat): string[] {
  if (format === 'tube') return Array.from({ length: n }, (_, i) => `T${i + 1}`);
  const { rows, cols } = PLATE_CONFIGS[format];
  const rowLabels = 'ABCDEFGH'.slice(0, rows);
  const positions: string[] = [];
  outer: for (const row of rowLabels) {
    for (let col = 1; col <= cols; col++) {
      positions.push(`${row}${col}`);
      if (positions.length >= n) break outer;
    }
  }
  return positions;
}

function csvCell(val: string | number): string {
  const s = String(val);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"` : s;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface QRReportModalProps {
  samples: LabSample[];
  onClose: () => void;
  baseUrlOverride?: string;
  onBaseUrlChange?: (url: string) => void;
}

export const QRReportModal: React.FC<QRReportModalProps> = ({ samples, onClose, baseUrlOverride }) => {
  const [mode, setMode]           = useState<Mode>('summary');
  const [targetConc, setTargetConc] = useState('');
  const [targetVol, setTargetVol]   = useState('');
  const [plateFormat, setPlateFormat] = useState<PlateFormat>('96');
  const [overrides, setOverrides]   = useState<Map<string, PerSampleOverride>>(new Map());
  const [localBaseUrl, setLocalBaseUrl] = useState('');
  const [mountTime, setMountTime]   = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setLocalBaseUrl(window.location.origin);
      setMountTime(new Date().toLocaleString());
    }
  }, []);

  // Escape to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  // QR payload
  const qrPayload = useMemo(() => {
    const summary = samples.map(s => {
      if (s.sampleType === 'cell-count') {
        const m = s.metadata?.cellCountData;
        return { type: 'cell', n: s.sampleName, t: m?.totalCells, v: m?.viability, d: m?.meanDiameter };
      }
      return { type: 'quant', n: s.sampleName, c: s.concentration, u: s.metadata?.unit || 'ng/uL', r1: s.ratios?.['260/280'], r2: s.ratios?.['260/230'] };
    });
    const payload = { v: 1, ts: Math.floor(Date.now() / 1000), d: summary };
    const effectiveBaseUrl = baseUrlOverride || localBaseUrl;
    return `${effectiveBaseUrl}/mobile-report?import=${encodeURIComponent(JSON.stringify(payload))}`;
  }, [samples, baseUrlOverride, localBaseUrl]);

  // ── Summary dilution results (existing logic) ────────────────────────────────

  const dilutionResults = useMemo(() => {
    if (!targetConc || !targetVol || samples.length === 0) return null;
    const c2 = parseFloat(targetConc);
    const v2 = parseFloat(targetVol);
    return samples.map(s => {
      const c1 = s.concentration || 0;
      if (c1 <= c2) return { name: s.sampleName, error: 'Stock conc too low' };
      const v1 = (c2 * v2) / c1;
      return { name: s.sampleName, v1: v1.toFixed(2), vDil: (v2 - v1).toFixed(2) };
    });
  }, [samples, targetConc, targetVol]);

  // ── Plate planner ────────────────────────────────────────────────────────────

  const wellPositions = useMemo(
    () => generateWellPositions(samples.length, plateFormat),
    [samples.length, plateFormat]
  );

  const plannerRows = useMemo<PlannerRow[]>(() => {
    return samples.map((s, i) => {
      const ov = overrides.get(s.id ?? String(i));
      const c2 = parseFloat(ov?.c2 ?? targetConc) || 0;
      const v2 = parseFloat(ov?.v2 ?? targetVol)  || 0;
      const c1 = s.concentration ?? 0;
      const base = { well: wellPositions[i], name: s.sampleName, c1, c2, v2 };
      if (!c2 || !v2)   return { ...base, v1: null, vd: null, status: 'incomplete'  };
      if (c1 <= 0)       return { ...base, v1: null, vd: null, status: 'no-stock'   };
      if (c1 <= c2)      return { ...base, v1: null, vd: null, status: 'too-dilute' };
      const v1 = (c2 * v2) / c1;
      const vd = v2 - v1;
      return { ...base, v1, vd, status: v1 < 0.1 ? 'warn-low-vol' : 'ok' };
    });
  }, [samples, wellPositions, overrides, targetConc, targetVol]);

  const setOverride = useCallback((sampleKey: string, field: 'c2' | 'v2', value: string) => {
    setOverrides(prev => {
      const next = new Map(prev);
      const existing = next.get(sampleKey) ?? { c2: '', v2: '' };
      next.set(sampleKey, { ...existing, [field]: value });
      return next;
    });
  }, []);

  const exportPlannerCSV = useCallback(() => {
    const headers = ['Well', 'Sample Name', 'Stock Conc C1 (ng/uL)', 'Target Conc C2 (ng/uL)', 'Target Vol V2 (uL)', 'Source Vol V1 (uL)', 'Diluent Vol Vd (uL)', 'Status'];
    const rows = plannerRows.map(r => [
      r.well, r.name,
      r.c1 > 0 ? r.c1.toFixed(3) : 'N/A',
      r.c2 > 0 ? r.c2.toFixed(3) : 'N/A',
      r.v2 > 0 ? r.v2.toFixed(2) : 'N/A',
      r.v1 != null ? r.v1.toFixed(2) : 'N/A',
      r.vd != null ? r.vd.toFixed(2) : 'N/A',
      r.status,
    ]);
    const content = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dilution-plan-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [plannerRows]);

  const plannerStats = useMemo(() => ({
    ready:    plannerRows.filter(r => r.status === 'ok' || r.status === 'warn-low-vol').length,
    errors:   plannerRows.filter(r => r.status === 'too-dilute' || r.status === 'no-stock').length,
    warnings: plannerRows.filter(r => r.status === 'warn-low-vol').length,
    incomplete: plannerRows.filter(r => r.status === 'incomplete').length,
  }), [plannerRows]);

  const unit = samples[0]?.metadata?.unit || 'ng/µL';

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 print:!static print:!block print:!bg-white print:!p-0 print:!z-auto print:!w-auto print:!h-auto print:!max-w-none print:!max-h-none print:!overflow-visible">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col md:flex-row max-h-[92vh] print:!max-h-none print:!shadow-none print:!block print:!w-full print:!border-none print:!overflow-visible print:!max-w-none print:!flex-none print:!h-auto print:!z-auto">

        {/* Left Side: QR Code */}
        <div className="p-8 bg-slate-50 border-r border-slate-100 flex flex-col items-center justify-center text-center w-full md:w-[320px] shrink-0 print:hidden">
          <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-200 mb-6">
            <QRCodeSVG value={qrPayload} size={200} level="M" includeMargin={false} />
          </div>
          <div className="flex items-center gap-2 text-slate-800 font-bold mb-2">
            <Smartphone className="h-5 w-5 text-blue-600" /> Scan to Mobile
          </div>
          <p className="text-xs text-slate-500 max-w-[220px]">
            Scan with your phone to import these {samples.length} result{samples.length !== 1 ? 's' : ''}.
          </p>

          {/* Mode toggle */}
          <div className="mt-8 w-full">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">View mode</p>
            <div className="flex rounded-xl border border-slate-200 overflow-hidden text-sm w-full">
              <button
                onClick={() => setMode('summary')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 font-bold transition-colors ${mode === 'summary' ? 'text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                style={mode === 'summary' ? { backgroundColor: BRAND_COLOR } : {}}
              >
                <List className="h-3.5 w-3.5" /> Summary
              </button>
              <button
                onClick={() => setMode('planner')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 font-bold transition-colors ${mode === 'planner' ? 'text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                style={mode === 'planner' ? { backgroundColor: BRAND_COLOR } : {}}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Plate Plan
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: content area */}
        <div id="printable-report" className="flex-1 flex flex-col overflow-hidden print:!overflow-visible print:!block print:!w-full">

          {/* Header row */}
          <div className="flex justify-between items-start px-8 pt-8 pb-4 shrink-0">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">
                {mode === 'planner' ? 'Plate Dilution Planner' : 'Data Export Report'}
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {mode === 'planner' ? `${samples.length} samples · ${PLATE_CONFIGS[plateFormat].label} layout` : 'Summary Report & Dilution Calculator'}
              </p>
            </div>
            <div className="flex items-center gap-2 print:hidden">
              {mode === 'planner' && (
                <button
                  onClick={exportPlannerCSV}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-bold rounded-lg border transition-colors"
                  style={{ color: BRAND_COLOR, borderColor: `${BRAND_COLOR}44`, backgroundColor: `${BRAND_COLOR}08` }}
                >
                  <Download className="h-4 w-4" /> Export CSV
                </button>
              )}
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-bold transition-colors"
              >
                <Printer className="h-4 w-4" /> Print
              </button>
              <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
          </div>

          {/* Shared dilution parameter inputs */}
          <div className="px-8 pb-4 shrink-0">
            <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100 print:border-none print:p-0">
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex items-center gap-2 text-blue-700 font-bold text-sm w-full print:hidden">
                  <Calculator className="h-4 w-4" />
                  {mode === 'planner' ? 'Global defaults — override per-sample in the table' : 'Dilution Parameters'}
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-blue-600 mb-1 print:text-gray-500">Target Conc C₂ ({unit})</label>
                  <input
                    type="number" placeholder="e.g. 10" value={targetConc}
                    onChange={e => setTargetConc(e.target.value)}
                    className="w-32 px-3 py-2 rounded-lg border border-blue-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none print:hidden"
                  />
                  <div className="hidden print:block text-lg font-bold">{targetConc || '—'} {targetConc && unit}</div>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-blue-600 mb-1 print:text-gray-500">Target Vol V₂ (µL)</label>
                  <input
                    type="number" placeholder="e.g. 50" value={targetVol}
                    onChange={e => setTargetVol(e.target.value)}
                    className="w-32 px-3 py-2 rounded-lg border border-blue-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none print:hidden"
                  />
                  <div className="hidden print:block text-lg font-bold">{targetVol || '—'} {targetVol && 'µL'}</div>
                </div>
                {mode === 'planner' && (
                  <div className="print:hidden">
                    <label className="block text-[10px] font-black uppercase text-blue-600 mb-1">Plate format</label>
                    <select
                      value={plateFormat}
                      onChange={e => setPlateFormat(e.target.value as PlateFormat)}
                      className="px-3 py-2 rounded-lg border border-blue-200 text-sm bg-white outline-none"
                    >
                      {(Object.entries(PLATE_CONFIGS) as [PlateFormat, typeof PLATE_CONFIGS[PlateFormat]][]).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Summary mode ─────────────────────────────────────────────────── */}
          {mode === 'summary' && (
            <div className="flex-1 overflow-y-auto px-8 pb-8 print:!overflow-visible space-y-3">
              <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-wider print:text-black">
                {dilutionResults ? 'Dilution Plan' : 'Report Details'}
              </h3>

              {dilutionResults ? dilutionResults.map((res: any, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl text-sm print:border-b print:border-gray-200 print:rounded-none print:px-0">
                  <span className="font-bold text-slate-700 truncate max-w-[200px] print:text-black">{res.name}</span>
                  {res.error ? (
                    <span className="text-red-500 text-xs font-medium">{res.error}</span>
                  ) : (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded font-mono print:bg-transparent print:p-0 print:text-black">
                        Stock: <b>{res.v1}µL</b>
                      </span>
                      <span className="text-slate-300">+</span>
                      <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded font-mono print:bg-transparent print:p-0 print:text-black">
                        Buffer: <b>{res.vDil}µL</b>
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

              <div className="hidden print:block mt-12 text-center text-xs text-gray-400 border-t border-gray-200 pt-4">
                Generated by DeNovix Lab Vault • {mountTime}
              </div>
            </div>
          )}

          {/* ── Plate Planner mode ───────────────────────────────────────────── */}
          {mode === 'planner' && (
            <div className="flex-1 overflow-y-auto px-8 pb-8 print:!overflow-visible">

              {/* Stats bar */}
              {(targetConc && targetVol) && (
                <div className="flex gap-4 mb-4 print:hidden">
                  {[
                    { label: 'Ready',    value: plannerStats.ready,      color: 'text-emerald-600' },
                    { label: 'Warnings', value: plannerStats.warnings,    color: 'text-amber-600'  },
                    { label: 'Errors',   value: plannerStats.errors,      color: 'text-red-600'    },
                    { label: 'Pending',  value: plannerStats.incomplete,  color: 'text-slate-400'  },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex items-center gap-1.5 text-sm">
                      <span className={`text-xl font-black ${color}`}>{value}</span>
                      <span className="text-slate-400 font-medium">{label}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Planner table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b-2 border-slate-200 text-left">
                      <th className="py-2 pr-3 text-[10px] font-black uppercase tracking-wide text-slate-400 w-16">Well</th>
                      <th className="py-2 pr-3 text-[10px] font-black uppercase tracking-wide text-slate-400">Sample</th>
                      <th className="py-2 pr-3 text-[10px] font-black uppercase tracking-wide text-slate-400 text-right">C₁ ({unit})</th>
                      <th className="py-2 pr-3 text-[10px] font-black uppercase tracking-wide text-slate-400 text-right print:hidden">
                        Override C₂
                      </th>
                      <th className="py-2 pr-3 text-[10px] font-black uppercase tracking-wide text-slate-400 text-right print:hidden">
                        Override V₂
                      </th>
                      <th className="py-2 pr-3 text-[10px] font-black uppercase tracking-wide text-slate-400 text-right">V₁ Source (µL)</th>
                      <th className="py-2 pr-3 text-[10px] font-black uppercase tracking-wide text-slate-400 text-right">Vd Diluent (µL)</th>
                      <th className="py-2 text-[10px] font-black uppercase tracking-wide text-slate-400 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plannerRows.map((row, i) => {
                      const sampleKey = samples[i]?.id ?? String(i);
                      const ov = overrides.get(sampleKey);
                      return (
                        <tr key={sampleKey} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                          <td className="py-2 pr-3">
                            <span className="inline-block px-2 py-0.5 bg-slate-100 rounded text-xs font-mono font-bold text-slate-600">{row.well}</span>
                          </td>
                          <td className="py-2 pr-3 font-medium text-slate-800 max-w-[160px] truncate">{row.name}</td>
                          <td className="py-2 pr-3 text-right font-mono text-slate-600">
                            {row.c1 > 0 ? row.c1.toFixed(2) : <span className="text-slate-300">—</span>}
                          </td>
                          {/* Per-sample override inputs — hidden in print */}
                          <td className="py-1.5 pr-3 print:hidden">
                            <input
                              type="number"
                              value={ov?.c2 ?? ''}
                              onChange={e => setOverride(sampleKey, 'c2', e.target.value)}
                              placeholder={targetConc || '—'}
                              className="w-20 px-2 py-1 border border-slate-200 rounded text-xs text-right font-mono outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                            />
                          </td>
                          <td className="py-1.5 pr-3 print:hidden">
                            <input
                              type="number"
                              value={ov?.v2 ?? ''}
                              onChange={e => setOverride(sampleKey, 'v2', e.target.value)}
                              placeholder={targetVol || '—'}
                              className="w-20 px-2 py-1 border border-slate-200 rounded text-xs text-right font-mono outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                            />
                          </td>
                          <td className="py-2 pr-3 text-right font-mono font-bold">
                            {row.v1 != null
                              ? <span className="text-emerald-700">{row.v1.toFixed(2)}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono font-bold">
                            {row.vd != null
                              ? <span className="text-blue-700">{row.vd.toFixed(2)}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="py-2 text-center">
                            {row.status === 'ok'           && <CheckCircle    className="h-4 w-4 text-emerald-500 mx-auto" />}
                            {row.status === 'warn-low-vol' && <AlertTriangle  className="h-4 w-4 text-amber-500 mx-auto" />}
                            {row.status === 'too-dilute'   && <span className="text-[10px] font-bold text-red-500">C₁≤C₂</span>}
                            {row.status === 'no-stock'     && <span className="text-[10px] font-bold text-red-500">No C₁</span>}
                            {row.status === 'incomplete'   && <span className="text-[10px] text-slate-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Legend */}
              <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-slate-400 print:hidden">
                <span className="flex items-center gap-1.5"><CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> Ready</span>
                <span className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Source vol &lt;0.1 µL — verify pipette range</span>
                <span className="flex items-center gap-1.5"><span className="font-bold text-red-500 text-xs">C₁≤C₂</span> Stock too dilute to reach target</span>
                <span className="flex items-center gap-1.5"><Info className="h-3.5 w-3.5" /> Per-sample overrides take precedence over global defaults</span>
              </div>

              {/* Print footer */}
              <div className="hidden print:block mt-12 text-center text-xs text-gray-400 border-t border-gray-200 pt-4">
                Generated by DeNovix Lab Vault • {mountTime}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
