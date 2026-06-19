"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { LabSample } from '../types';
import { convertFirestoreTimestampToDate } from '@/lib/utils';
import { BRAND_COLOR } from '@/lib/constants';
import { TrendingUp, TrendingDown, Minus, ArrowLeft } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

type MetricKey = 'concentration' | '260/280' | '260/230' | 'viability' | 'totalCells';

const METRICS: { key: MetricKey; label: string; unit: string }[] = [
  { key: 'concentration',  label: 'Concentration',  unit: 'ng/µL' },
  { key: '260/280',        label: '260/280 Ratio',  unit: ''      },
  { key: '260/230',        label: '260/230 Ratio',  unit: ''      },
  { key: 'viability',      label: 'Cell Viability', unit: '%'     },
  { key: 'totalCells',     label: 'Total Cells',    unit: 'cells/mL' },
];

const PALETTE = ['#3368c6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function metricValue(s: LabSample, key: MetricKey): number | null {
  switch (key) {
    case 'concentration': return s.concentration ?? null;
    case '260/280':       return s.ratios?.['260/280'] ?? null;
    case '260/230':       return s.ratios?.['260/230'] ?? null;
    case 'viability':     return s.metadata?.cellCountData?.viability ?? null;
    case 'totalCells':    return s.metadata?.cellCountData?.totalCells ?? null;
  }
}

function linReg(xs: number[], ys: number[]): { slope: number; intercept: number } | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b) / n;
  const my = ys.reduce((a, b) => a + b) / n;
  const num = xs.reduce((acc, x, i) => acc + (x - mx) * (ys[i] - my), 0);
  const den = xs.reduce((acc, x) => acc + (x - mx) ** 2, 0);
  if (Math.abs(den) < 1e-10) return null;
  const slope = num / den;
  return { slope, intercept: my - slope * mx };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface TrendChartProps {
  samples: LabSample[];
  onClose: () => void;
}

export const TrendChart: React.FC<TrendChartProps> = ({ samples, onClose }) => {
  const [metric, setMetric]       = useState<MetricKey>('concentration');
  const [filterApp, setFilterApp] = useState('all');
  const [showTrend, setShowTrend] = useState(true);
  const [timeRange, setTimeRange] = useState<'all' | '1y' | '6m' | '3m'>('all');

  const plotRef   = useRef<HTMLDivElement>(null);
  const plotlyRef = useRef<any>(null);
  const metricDef = METRICS.find(m => m.key === metric)!;

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

  const applications = useMemo(
    () => Array.from(new Set(samples.map(s => s.application).filter(Boolean))).sort(),
    [samples]
  );

  // All (date, value, app, name) points respecting time/app filter
  const points = useMemo(() => {
    const now = Date.now();
    const cutoff = timeRange === '3m' ? now - 90*86400e3
                 : timeRange === '6m' ? now - 180*86400e3
                 : timeRange === '1y' ? now - 365*86400e3 : 0;

    return samples.flatMap(s => {
      if (filterApp !== 'all' && s.application !== filterApp) return [];
      const date  = convertFirestoreTimestampToDate(s.measuredAt);
      const value = metricValue(s, metric);
      if (!date || value == null || value < 0) return [];
      if (date.getTime() < cutoff) return [];
      return [{ date, value, app: s.application || 'Unknown', name: s.sampleName }];
    }).sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [samples, metric, filterApp, timeRange]);

  // Group points by application
  const byApp = useMemo(() => {
    const map = new Map<string, typeof points>();
    for (const p of points) {
      if (!map.has(p.app)) map.set(p.app, []);
      map.get(p.app)!.push(p);
    }
    return map;
  }, [points]);

  // Drift stats per app (slope in units/month, CV%)
  const driftStats = useMemo(() => {
    return Array.from(byApp.entries()).map(([app, pts]) => {
      const ys  = pts.map(p => p.value);
      const xs  = pts.map(p => p.date.getTime() / 86400e3);
      const mean = ys.reduce((a, b) => a + b) / ys.length;
      const variance = ys.reduce((acc, y) => acc + (y - mean) ** 2, 0) / ys.length;
      const sd = Math.sqrt(variance);
      const reg = linReg(xs, ys);
      return {
        app,
        n: pts.length,
        mean,
        cv: mean > 0 ? (sd / mean) * 100 : 0,
        slopePerMonth: reg ? reg.slope * 30 : null,
        driftPct: reg && mean > 0 ? (reg.slope * 30 / mean) * 100 : null,
      };
    });
  }, [byApp]);

  // Build Plotly traces
  const traces = useMemo(() => {
    const out: any[] = [];
    let ci = 0;
    byApp.forEach((pts, app) => {
      const color = PALETTE[ci++ % PALETTE.length];
      out.push({
        x:    pts.map(p => p.date.toISOString()),
        y:    pts.map(p => p.value),
        text: pts.map(p => p.name),
        mode: 'markers',
        type: 'scatter',
        name: app,
        hovertemplate: '<b>%{text}</b><br>%{x|%Y-%m-%d}<br>Value: %{y:.4f}<extra></extra>',
        marker: { color, size: 7, opacity: 0.85 },
      });
      if (showTrend && pts.length >= 3) {
        const xs  = pts.map(p => p.date.getTime() / 86400e3);
        const ys  = pts.map(p => p.value);
        const reg = linReg(xs, ys);
        if (reg) {
          out.push({
            x:    [pts[0].date.toISOString(), pts[pts.length - 1].date.toISOString()],
            y:    [reg.intercept + reg.slope * xs[0], reg.intercept + reg.slope * xs[xs.length - 1]],
            mode: 'lines',
            type: 'scatter',
            name: `${app} trend`,
            showlegend: false,
            line:  { color, width: 2, dash: 'dash' },
            hoverinfo: 'skip',
          });
        }
      }
    });
    return out;
  }, [byApp, showTrend]);

  // Render chart whenever data or options change
  useEffect(() => {
    if (!plotRef.current || traces.length === 0) return;
    let mounted = true;
    (async () => {
      if (!plotlyRef.current) plotlyRef.current = (await import('plotly.js')).default;
      if (!mounted || !plotRef.current) return;

      const unitSuffix = metricDef.unit
        || (metric === 'concentration'
            ? samples.find(s => s.metadata?.unit)?.metadata?.unit ?? ''
            : '');

      plotlyRef.current.react(plotRef.current, traces, {
        autosize:  true,
        uirevision: `${metric}-${filterApp}-${timeRange}`,
        title: { text: `${metricDef.label} Over Time`, font: { size: 16, color: '#1e293b' } },
        xaxis: { title: 'Date', type: 'date', gridcolor: '#f1f5f9' },
        yaxis: {
          title: unitSuffix ? `${metricDef.label} (${unitSuffix})` : metricDef.label,
          gridcolor: '#f1f5f9', zeroline: false,
        },
        hovermode:    'closest',
        margin:       { t: 60, b: 60, l: 70, r: 20 },
        showlegend:   true,
        legend:       { orientation: 'h', y: -0.2 },
        plot_bgcolor:  '#ffffff',
        paper_bgcolor: '#ffffff',
      }, { responsive: true, displaylogo: false });
    })();
    return () => { mounted = false; };
  }, [traces, metric, filterApp, timeRange, metricDef, samples]);

  // ── Render ──────────────────────────────────────────────────────────────────

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
        <TrendingUp className="h-5 w-5" style={{ color: BRAND_COLOR }} />
        <h1 className="text-base font-bold text-slate-900 mr-auto">Trend & Drift Analytics</h1>

        {/* Controls */}
        <select
          value={metric}
          onChange={e => setMetric(e.target.value as MetricKey)}
          className="px-3 py-1.5 border rounded-lg text-sm bg-white outline-none font-medium"
        >
          {METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <select
          value={filterApp}
          onChange={e => setFilterApp(e.target.value)}
          className="px-3 py-1.5 border rounded-lg text-sm bg-white outline-none"
        >
          <option value="all">All Applications</option>
          {applications.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <div className="flex rounded-lg border overflow-hidden text-sm">
          {(['all', '1y', '6m', '3m'] as const).map(r => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className={`px-3 py-1.5 font-medium transition-colors ${timeRange === r ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {r === 'all' ? 'All time' : r}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showTrend}
            onChange={e => setShowTrend(e.target.checked)}
            className="rounded"
          />
          Trend lines
        </label>
      </div>

      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Chart */}
        <div className="flex-1 min-h-0 p-4">
          {points.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-slate-400">
                <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-25" />
                <p className="font-medium">No data for the selected metric and filter</p>
                <p className="text-sm mt-1">Try a different metric, application, or time range</p>
              </div>
            </div>
          ) : (
            <div ref={plotRef} className="w-full h-full" style={{ minHeight: 360 }} />
          )}
        </div>

        {/* Drift summary cards */}
        {driftStats.length > 0 && (
          <div className="border-t border-slate-100 px-6 py-4 bg-slate-50/60 shrink-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Drift Summary</p>
            <div className="flex flex-wrap gap-3">
              {driftStats.map(({ app, n, mean, cv, driftPct }) => {
                const drifting = driftPct != null && Math.abs(driftPct) > 2;
                return (
                  <div
                    key={app}
                    className={`flex items-center gap-4 px-4 py-2.5 rounded-xl border bg-white ${drifting ? 'border-amber-200' : 'border-slate-200'}`}
                  >
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 truncate max-w-[150px]">{app}</p>
                      <p className="text-lg font-black font-mono text-slate-900">{mean.toFixed(3)}</p>
                      <p className="text-[10px] text-slate-400">{n} point{n !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-slate-400 uppercase font-bold">CV</p>
                      <p className={`text-sm font-bold ${cv > 10 ? 'text-amber-600' : 'text-emerald-600'}`}>{cv.toFixed(1)}%</p>
                    </div>
                    {driftPct != null && (
                      <div className="flex items-center gap-1.5">
                        {driftPct > 0.5  ? <TrendingUp   className="h-4 w-4 text-amber-500" />
                        : driftPct < -0.5 ? <TrendingDown className="h-4 w-4 text-blue-500" />
                        :                   <Minus        className="h-4 w-4 text-slate-300" />}
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-bold">Drift/mo</p>
                          <p className={`text-sm font-bold ${drifting ? 'text-amber-600' : 'text-slate-500'}`}>
                            {driftPct > 0 ? '+' : ''}{driftPct.toFixed(1)}%
                          </p>
                        </div>
                      </div>
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
