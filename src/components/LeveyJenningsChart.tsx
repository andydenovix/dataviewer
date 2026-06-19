"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { LabSample } from '../types';
import { convertFirestoreTimestampToDate } from '@/lib/utils';
import { BRAND_COLOR } from '@/lib/constants';
import { Activity, ArrowLeft, CheckCircle, XCircle } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type MetricKey = 'concentration' | '260/280' | '260/230' | 'viability' | 'totalCells';

const METRICS: { key: MetricKey; label: string; unit: string }[] = [
  { key: 'concentration',  label: 'Concentration',  unit: 'ng/µL' },
  { key: '260/280',        label: '260/280 Ratio',  unit: ''      },
  { key: '260/230',        label: '260/230 Ratio',  unit: ''      },
  { key: 'viability',      label: 'Cell Viability', unit: '%'     },
  { key: 'totalCells',     label: 'Total Cells',    unit: 'cells/mL' },
];

interface WestgardViolation {
  index: number;
  rule: string;
  label: string;
  description: string;
  severity: 'warning' | 'reject';
}

interface ControlPoint {
  date: Date;
  value: number;
  name: string;
  zScore: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function metricValue(s: LabSample, key: MetricKey): number | null {
  switch (key) {
    case 'concentration': return s.concentration ?? null;
    case '260/280':       return s.ratios?.['260/280'] ?? null;
    case '260/230':       return s.ratios?.['260/230'] ?? null;
    case 'viability':     return s.metadata?.cellCountData?.viability ?? null;
    case 'totalCells':    return s.metadata?.cellCountData?.totalCells ?? null;
  }
}

function detectWestgard(zScores: number[]): WestgardViolation[] {
  const violations: WestgardViolation[] = [];
  const n = zScores.length;

  for (let i = 0; i < n; i++) {
    const z = zScores[i];

    // 1-2s  warning
    if (Math.abs(z) > 2 && Math.abs(z) <= 3) {
      violations.push({ index: i, rule: '1-2s', label: '1-2s', description: 'Warning: 1 value outside ±2SD', severity: 'warning' });
    }

    // 1-3s  reject
    if (Math.abs(z) > 3) {
      violations.push({ index: i, rule: '1-3s', label: '1-3s', description: 'Reject: 1 value outside ±3SD', severity: 'reject' });
    }

    // 2-2s  reject: 2 consecutive outside same ±2SD
    if (i >= 1) {
      const z0 = zScores[i - 1];
      if (Math.abs(z) > 2 && Math.abs(z0) > 2 && Math.sign(z) === Math.sign(z0)) {
        violations.push({ index: i, rule: '2-2s', label: '2-2s', description: 'Reject: 2 consecutive values outside ±2SD on same side', severity: 'reject' });
      }
    }

    // R-4s  reject: range > 4SD within consecutive pair
    if (i >= 1) {
      const diff = Math.abs(z - zScores[i - 1]);
      if (diff > 4) {
        violations.push({ index: i, rule: 'R-4s', label: 'R-4s', description: 'Reject: Range of 2 consecutive values > 4SD', severity: 'reject' });
      }
    }

    // 4-1s  reject: 4 consecutive on same side of mean
    if (i >= 3) {
      const seg = zScores.slice(i - 3, i + 1);
      if (seg.every(z => z > 1) || seg.every(z => z < -1)) {
        violations.push({ index: i, rule: '4-1s', label: '4-1s', description: 'Reject: 4 consecutive values outside ±1SD on same side', severity: 'reject' });
      }
    }

    // 10x   reject: 10 consecutive on same side of mean
    if (i >= 9) {
      const seg = zScores.slice(i - 9, i + 1);
      if (seg.every(z => z > 0) || seg.every(z => z < 0)) {
        violations.push({ index: i, rule: '10x', label: '10x', description: 'Reject: 10 consecutive values on same side of mean', severity: 'reject' });
      }
    }
  }

  return violations;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface LeveyJenningsChartProps {
  samples: LabSample[];
  onClose: () => void;
}

export const LeveyJenningsChart: React.FC<LeveyJenningsChartProps> = ({ samples, onClose }) => {
  const [metric, setMetric]           = useState<MetricKey>('concentration');
  const [controlFilter, setControlFilter] = useState('ctrl');

  const plotRef   = useRef<HTMLDivElement>(null);
  const plotlyRef = useRef<any>(null);

  const metricDef = METRICS.find(m => m.key === metric)!;

  // Escape to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  useEffect(() => () => {
    if (plotRef.current && plotlyRef.current) plotlyRef.current.purge(plotRef.current);
  }, []);

  // Filter to "control" samples
  const controlPoints = useMemo<ControlPoint[]>(() => {
    const term = controlFilter.trim().toLowerCase();
    return samples
      .flatMap(s => {
        if (term && !s.sampleName.toLowerCase().includes(term)) return [];
        const date  = convertFirestoreTimestampToDate(s.measuredAt);
        const value = metricValue(s, metric);
        if (!date || value == null || value < 0) return [];
        return [{ date, value, name: s.sampleName, zScore: 0 }];
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [samples, metric, controlFilter]);

  // Stats: mean and SD from control points
  const { mean, sd, n } = useMemo(() => {
    if (controlPoints.length === 0) return { mean: 0, sd: 1, n: 0 };
    const ys = controlPoints.map(p => p.value);
    const m  = ys.reduce((a, b) => a + b) / ys.length;
    const variance = ys.reduce((acc, y) => acc + (y - m) ** 2, 0) / ys.length;
    return { mean: m, sd: Math.sqrt(variance) || 1, n: ys.length };
  }, [controlPoints]);

  // Assign z-scores after computing mean/sd
  const points = useMemo<ControlPoint[]>(() => {
    return controlPoints.map(p => ({ ...p, zScore: (p.value - mean) / sd }));
  }, [controlPoints, mean, sd]);

  const violations = useMemo(() => detectWestgard(points.map(p => p.zScore)), [points]);

  // Group violations by index for marker lookup
  const violationsByIndex = useMemo(() => {
    const map = new Map<number, WestgardViolation>();
    for (const v of violations) {
      if (!map.has(v.index) || v.severity === 'reject') map.set(v.index, v);
    }
    return map;
  }, [violations]);

  // Build Plotly figure
  useEffect(() => {
    if (!plotRef.current || points.length === 0) return;
    let mounted = true;
    (async () => {
      if (!plotlyRef.current) plotlyRef.current = (await import('plotly.js')).default;
      if (!mounted || !plotRef.current) return;

      const xs     = points.map(p => p.date.toISOString());
      const ys     = points.map(p => p.value);
      const colors = points.map((_, i) => {
        const v = violationsByIndex.get(i);
        if (!v) return '#64748b';
        return v.severity === 'reject' ? '#ef4444' : '#f59e0b';
      });
      const symbols = points.map((_, i) => {
        const v = violationsByIndex.get(i);
        if (!v) return 'circle';
        return v.severity === 'reject' ? 'x' : 'circle';
      });
      const sizes = points.map((_, i) => violationsByIndex.has(i) ? 10 : 7);
      const text  = points.map((p, i) => {
        const v = violationsByIndex.get(i);
        return `${p.name}<br>${p.date.toLocaleDateString()}<br>Value: ${p.value.toFixed(4)}<br>z = ${p.zScore.toFixed(2)}${v ? `<br><b>⚠ ${v.rule}: ${v.description}</b>` : ''}`;
      });

      const traces: any[] = [
        // SD band shapes rendered as traces so they appear in the legend
        {
          x: [...xs, ...xs.slice().reverse()],
          y: [...ys.map(() => mean + 3 * sd), ...ys.map(() => mean - 3 * sd).reverse()],
          fill: 'toself',
          fillcolor: 'rgba(239,68,68,0.07)',
          line: { width: 0 },
          type: 'scatter',
          mode: 'none',
          name: '±3SD',
          hoverinfo: 'skip',
          showlegend: true,
        },
        {
          x: [...xs, ...xs.slice().reverse()],
          y: [...ys.map(() => mean + 2 * sd), ...ys.map(() => mean - 2 * sd).reverse()],
          fill: 'toself',
          fillcolor: 'rgba(245,158,11,0.10)',
          line: { width: 0 },
          type: 'scatter',
          mode: 'none',
          name: '±2SD',
          hoverinfo: 'skip',
          showlegend: true,
        },
        // Main scatter
        {
          x: xs,
          y: ys,
          mode: 'lines+markers',
          type: 'scatter',
          name: 'Control values',
          text,
          hovertemplate: '%{text}<extra></extra>',
          marker: { color: colors, symbol: symbols, size: sizes, line: { width: 1, color: '#fff' } },
          line: { color: '#94a3b8', width: 1.5, dash: 'dot' },
        },
      ];

      const shapes = [
        { type: 'line', x0: xs[0], x1: xs[xs.length-1], y0: mean,          y1: mean,          line: { color: '#3368c6', width: 2, dash: 'solid' }  },
        { type: 'line', x0: xs[0], x1: xs[xs.length-1], y0: mean + sd,     y1: mean + sd,     line: { color: '#10b981', width: 1, dash: 'dash'  }  },
        { type: 'line', x0: xs[0], x1: xs[xs.length-1], y0: mean - sd,     y1: mean - sd,     line: { color: '#10b981', width: 1, dash: 'dash'  }  },
        { type: 'line', x0: xs[0], x1: xs[xs.length-1], y0: mean + 2 * sd, y1: mean + 2 * sd, line: { color: '#f59e0b', width: 1, dash: 'dash'  }  },
        { type: 'line', x0: xs[0], x1: xs[xs.length-1], y0: mean - 2 * sd, y1: mean - 2 * sd, line: { color: '#f59e0b', width: 1, dash: 'dash'  }  },
        { type: 'line', x0: xs[0], x1: xs[xs.length-1], y0: mean + 3 * sd, y1: mean + 3 * sd, line: { color: '#ef4444', width: 1, dash: 'dash'  }  },
        { type: 'line', x0: xs[0], x1: xs[xs.length-1], y0: mean - 3 * sd, y1: mean - 3 * sd, line: { color: '#ef4444', width: 1, dash: 'dash'  }  },
      ];

      const unitSuffix = metricDef.unit;

      plotlyRef.current.react(plotRef.current, traces, {
        autosize:  true,
        uirevision: `lj-${metric}-${controlFilter}`,
        xaxis: { title: 'Date', type: 'date', gridcolor: '#f1f5f9' },
        yaxis: {
          title: unitSuffix ? `${metricDef.label} (${unitSuffix})` : metricDef.label,
          gridcolor: '#f1f5f9', zeroline: false,
        },
        shapes,
        hovermode:    'closest',
        margin:       { t: 20, b: 60, l: 70, r: 20 },
        showlegend:   true,
        legend:       { orientation: 'h', y: -0.2 },
        plot_bgcolor:  '#ffffff',
        paper_bgcolor: '#ffffff',
      }, { responsive: true, displaylogo: false });
    })();
    return () => { mounted = false; };
  }, [points, mean, sd, metric, controlFilter, metricDef, violationsByIndex]);

  // Stats derived
  const cv = mean > 0 ? (sd / mean) * 100 : 0;
  const rejects  = violations.filter(v => v.severity === 'reject');
  const warnings = violations.filter(v => v.severity === 'warning');
  const passing  = rejects.length === 0;

  // Unique violations for sidebar (deduplicated by index+rule)
  const sidebarViolations = useMemo(() => {
    const seen = new Set<string>();
    return violations.filter(v => {
      const key = `${v.index}-${v.rule}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [violations]);

  return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 px-6 py-4 flex flex-wrap items-center gap-3 shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </button>
        <div className="w-px h-5 bg-slate-200" />
        <Activity className="h-5 w-5" style={{ color: BRAND_COLOR }} />
        <h1 className="text-base font-bold text-slate-900 mr-auto">Levey-Jennings Run Control Chart</h1>

        {/* Metric selector */}
        <select
          value={metric}
          onChange={e => setMetric(e.target.value as MetricKey)}
          className="px-3 py-1.5 border rounded-lg text-sm bg-white outline-none font-medium"
        >
          {METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>

        {/* Control filter */}
        <div className="relative flex items-center">
          <input
            type="text"
            value={controlFilter}
            onChange={e => setControlFilter(e.target.value)}
            placeholder="Filter by name…"
            className="pl-3 pr-3 py-1.5 border rounded-lg text-sm outline-none w-44"
          />
          <span className="absolute right-3 text-[10px] font-bold text-slate-400 pointer-events-none">FILTER</span>
        </div>

        {/* Pass/Fail badge */}
        {n > 0 && (
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold border ${
            passing
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {passing
              ? <CheckCircle className="h-4 w-4" />
              : <XCircle    className="h-4 w-4" />}
            {passing ? 'In Control' : `${rejects.length} Rejection${rejects.length !== 1 ? 's' : ''}`}
          </div>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Main chart area */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Stats bar */}
          {n > 0 && (
            <div className="border-b border-slate-100 px-6 py-3 flex flex-wrap gap-6 bg-slate-50/50 shrink-0">
              {[
                { label: 'n',       value: String(n)              },
                { label: 'Mean',    value: mean.toFixed(4)        },
                { label: 'SD',      value: sd.toFixed(4)          },
                { label: 'CV',      value: `${cv.toFixed(2)}%`, alert: cv > 15 },
                { label: 'Warn',    value: String(warnings.length), alert: warnings.length > 0 },
                { label: 'Reject',  value: String(rejects.length), alert: rejects.length > 0 },
              ].map(({ label, value, alert }) => (
                <div key={label} className="text-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                  <p className={`text-lg font-black font-mono ${alert ? 'text-amber-600' : 'text-slate-900'}`}>{value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Chart */}
          <div className="flex-1 min-h-0 p-4">
            {n === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center text-slate-400">
                  <Activity className="h-12 w-12 mx-auto mb-3 opacity-25" />
                  <p className="font-medium">No control samples found</p>
                  <p className="text-sm mt-1">
                    {controlFilter
                      ? `No samples match "${controlFilter}" — try a different filter`
                      : 'Upload control samples to see this chart'}
                  </p>
                </div>
              </div>
            ) : (
              <div ref={plotRef} className="w-full h-full" style={{ minHeight: 320 }} />
            )}
          </div>

          {/* SD legend footer */}
          {n > 0 && (
            <div className="border-t border-slate-100 px-6 py-2 flex flex-wrap gap-4 text-[11px] font-medium text-slate-500 shrink-0 bg-white">
              {[
                { color: '#3368c6', label: 'Mean' },
                { color: '#10b981', label: '±1 SD' },
                { color: '#f59e0b', label: '±2 SD' },
                { color: '#ef4444', label: '±3 SD' },
              ].map(({ color, label }) => (
                <span key={label} className="flex items-center gap-1.5">
                  <span className="inline-block w-5 h-0.5 rounded" style={{ backgroundColor: color }} />
                  {label}
                </span>
              ))}
              <span className="flex items-center gap-1.5 ml-4">
                <span className="inline-block w-3 h-3 rounded-full bg-amber-400" /> Warning (1-2s)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block font-black text-red-500 text-sm leading-none">✕</span> Rejection
              </span>
            </div>
          )}
        </div>

        {/* Violations sidebar */}
        {sidebarViolations.length > 0 && (
          <div className="w-72 border-l border-slate-200 flex flex-col shrink-0 bg-white">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Westgard Violations</p>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {sidebarViolations.map((v, i) => {
                const pt = points[v.index];
                return (
                  <div key={i} className={`px-4 py-3 ${v.severity === 'reject' ? 'bg-red-50/60' : 'bg-amber-50/60'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        v.severity === 'reject'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {v.label}
                      </span>
                      <span className={`text-[10px] font-bold uppercase ${
                        v.severity === 'reject' ? 'text-red-500' : 'text-amber-500'
                      }`}>
                        {v.severity}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-slate-700 mb-1">{v.description}</p>
                    {pt && (
                      <p className="text-[11px] text-slate-400">
                        {pt.name} · {pt.date.toLocaleDateString()} · {pt.value.toFixed(4)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
