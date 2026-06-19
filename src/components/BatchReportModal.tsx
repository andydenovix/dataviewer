"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { LabSample, Protocol } from '../types';
import { convertFirestoreTimestampToDate } from '@/lib/utils';
import { evaluateSampleQC } from '@/lib/qcService';
import { QC_PRESETS } from '@/lib/qcService';
import { BRAND_COLOR } from '@/lib/constants';
import { ArrowLeft, Printer, Sparkles, CheckCircle, XCircle, AlertTriangle, Loader } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type TimeRange = 'today' | '7d' | '30d' | 'all' | 'custom';

interface BatchStats {
  total: number;
  pass: number;
  fail: number;
  warn: number;
  avgConc: number | null;
  avg280:  number | null;
  avg230:  number | null;
  samples: LabSample[];
  dateFrom: Date | null;
  dateTo:   Date | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function avg(vals: (number | undefined)[]): number | null {
  const valid = vals.filter((v): v is number => v != null && !isNaN(v));
  return valid.length ? valid.reduce((a, b) => a + b) / valid.length : null;
}

function fmt(n: number | null, decimals = 3): string {
  return n == null ? '—' : n.toFixed(decimals);
}

function passLabel(violations: { severity: string }[]): 'PASS' | 'WARN' | 'FAIL' {
  if (violations.some(v => v.severity === 'fail')) return 'FAIL';
  if (violations.some(v => v.severity === 'warning')) return 'WARN';
  return 'PASS';
}

// ── Component ─────────────────────────────────────────────────────────────────

interface BatchReportModalProps {
  samples: LabSample[];
  protocols: Protocol[];
  operatorName?: string;
  onClose: () => void;
}

export const BatchReportModal: React.FC<BatchReportModalProps> = ({
  samples,
  protocols,
  operatorName = '',
  onClose,
}) => {
  const [timeRange, setTimeRange]       = useState<TimeRange>('7d');
  const todayStr     = new Date().toISOString().split('T')[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0];
  const [customFrom, setCustomFrom]     = useState(sevenDaysAgo);
  const [customTo,   setCustomTo]       = useState(todayStr);
  const [operator, setOperator]         = useState(operatorName);
  const [instrument, setInstrument]     = useState('');
  const [filterProtocol, setFilterProtocol] = useState('');
  const [aiSummary, setAiSummary]       = useState('');
  const [aiLoading, setAiLoading]       = useState(false);
  const [aiError, setAiError]           = useState('');

  // Escape to close (not during print)
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  // Compute batch stats
  const stats = useMemo<BatchStats>(() => {
    const now = Date.now();

    const filtered = samples.filter(s => {
      const date = convertFirestoreTimestampToDate(s.measuredAt);
      if (!date) return false;
      if (timeRange === 'custom') {
        const from = customFrom ? new Date(customFrom).getTime()               : 0;
        const to   = customTo   ? new Date(customTo + 'T23:59:59').getTime()   : now;
        if (date.getTime() < from || date.getTime() > to) return false;
      } else {
        const cutoff = timeRange === 'today' ? now - 86_400e3
                     : timeRange === '7d'    ? now - 7  * 86_400e3
                     : timeRange === '30d'   ? now - 30 * 86_400e3 : 0;
        if (date.getTime() < cutoff) return false;
      }
      if (filterProtocol && s.protocolId !== filterProtocol && s.metadata.protocolName !== filterProtocol) return false;
      return true;
    });

    let pass = 0, fail = 0, warn = 0;
    for (const s of filtered) {
      const preset = s.metadata?.protocolName
        ? protocols.find(p => p.name === s.metadata.protocolName)?.qcPreset
        : null;
      const profile = preset && preset !== 'None' && QC_PRESETS[preset]
        ? { name: preset, thresholds: QC_PRESETS[preset] }
        : null;
      if (profile) {
        const label = passLabel(evaluateSampleQC(s, profile));
        if (label === 'FAIL') fail++;
        else if (label === 'WARN') warn++;
        else pass++;
      } else {
        pass++;
      }
    }

    const dates = filtered
      .map(s => convertFirestoreTimestampToDate(s.measuredAt))
      .filter((d): d is Date => d != null)
      .sort((a, b) => a.getTime() - b.getTime());

    return {
      total: filtered.length,
      pass, fail, warn,
      avgConc: avg(filtered.map(s => s.concentration)),
      avg280:  avg(filtered.map(s => s.ratios?.['260/280'])),
      avg230:  avg(filtered.map(s => s.ratios?.['260/230'])),
      samples: filtered,
      dateFrom: dates[0] ?? null,
      dateTo:   dates[dates.length - 1] ?? null,
    };
  }, [samples, protocols, timeRange, customFrom, customTo, filterProtocol]);

  // Per-sample QC evaluation for the table
  const sampleRows = useMemo(() => {
    return stats.samples.map(s => {
      const preset = s.metadata?.protocolName
        ? protocols.find(p => p.name === s.metadata.protocolName)?.qcPreset
        : null;
      const profile = preset && preset !== 'None' && QC_PRESETS[preset]
        ? { name: preset, thresholds: QC_PRESETS[preset] }
        : null;
      const violations = profile ? evaluateSampleQC(s, profile) : [];
      const label = passLabel(violations);
      const date = convertFirestoreTimestampToDate(s.measuredAt);
      return { s, label, violations, date };
    });
  }, [stats.samples, protocols]);

  const generateAISummary = useCallback(async () => {
    setAiLoading(true);
    setAiError('');
    setAiSummary('');
    try {
      const res = await fetch('/api/batch-summary', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          total:    stats.total,
          pass:     stats.pass,
          fail:     stats.fail,
          warn:     stats.warn,
          avgConc:  stats.avgConc,
          avg280:   stats.avg280,
          avg230:   stats.avg230,
          operator,
          instrument,
          dateFrom: stats.dateFrom?.toLocaleDateString(),
          dateTo:   stats.dateTo?.toLocaleDateString(),
        }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Unknown error' }));
        setAiError(error || `HTTP ${res.status}`);
        return;
      }
      const { summary } = await res.json();
      setAiSummary(summary);
    } catch (e: any) {
      setAiError(e?.message || 'Network error');
    } finally {
      setAiLoading(false);
    }
  }, [stats, operator, instrument]);

  const reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col print:static print:block">
      {/* Header — hidden during print */}
      <div className="shrink-0 print:hidden">
        {/* Nav row */}
        <div className="border-b border-slate-100 px-6 py-3 flex items-center gap-3">
          <button onClick={onClose} className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </button>
          <div className="w-px h-5 bg-slate-200" />
          <Printer className="h-5 w-5" style={{ color: BRAND_COLOR }} />
          <h1 className="text-base font-bold text-slate-900 mr-auto">Batch QC Summary Report</h1>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold text-white transition-colors"
            style={{ backgroundColor: BRAND_COLOR }}
          >
            <Printer className="h-4 w-4" /> Print / Save PDF
          </button>
        </div>

        {/* Controls row */}
        <div className="border-b border-slate-200 px-6 py-3 flex flex-wrap items-center gap-3">
          {/* Time range */}
          <div className="flex rounded-lg border overflow-hidden text-sm">
            {(['today', '7d', '30d', 'all', 'custom'] as TimeRange[]).map(r => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-3 py-1.5 font-medium transition-colors ${timeRange === r ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {r === 'all' ? 'All time' : r === 'today' ? 'Today' : r === 'custom' ? 'Custom' : `Last ${r}`}
              </button>
            ))}
          </div>

          {/* Custom date range — shown only when Custom is selected */}
          {timeRange === 'custom' && (
            <div className="flex items-center gap-2 text-sm">
              <input
                type="date"
                value={customFrom}
                max={customTo || todayStr}
                onChange={e => setCustomFrom(e.target.value)}
                className="px-2 py-1.5 border rounded-lg text-sm outline-none text-slate-700"
              />
              <span className="text-slate-400 font-medium">to</span>
              <input
                type="date"
                value={customTo}
                min={customFrom}
                max={todayStr}
                onChange={e => setCustomTo(e.target.value)}
                className="px-2 py-1.5 border rounded-lg text-sm outline-none text-slate-700"
              />
            </div>
          )}

          {/* Operator + instrument */}
          <input
            type="text"
            value={operator}
            onChange={e => setOperator(e.target.value)}
            placeholder="Operator name"
            className="px-3 py-1.5 border rounded-lg text-sm outline-none w-36"
          />
          <input
            type="text"
            value={instrument}
            onChange={e => setInstrument(e.target.value)}
            placeholder="Instrument"
            className="px-3 py-1.5 border rounded-lg text-sm outline-none w-32"
          />

          {/* Protocol filter */}
          {protocols.length > 0 && (
            <select
              value={filterProtocol}
              onChange={e => setFilterProtocol(e.target.value)}
              className="px-3 py-1.5 border rounded-lg text-sm bg-white outline-none"
            >
              <option value="">All protocols</option>
              {protocols.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}

          <button
            onClick={generateAISummary}
            disabled={aiLoading || stats.total === 0}
            className="flex items-center gap-2 px-4 py-1.5 border rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
            style={{ color: BRAND_COLOR, borderColor: `${BRAND_COLOR}44`, backgroundColor: `${BRAND_COLOR}08` }}
          >
            {aiLoading ? <Loader className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            AI Summary
          </button>
        </div>
      </div>

      {/* Report content */}
      <div className="flex-1 overflow-y-auto print:overflow-visible">
        <div className="max-w-4xl mx-auto p-8 print:p-6">

          {/* Header */}
          <div className="flex items-start justify-between mb-8 pb-6 border-b-2 border-slate-200">
            <div>
              <h1 className="text-2xl font-black text-slate-900" style={{ color: BRAND_COLOR }}>Batch QC Summary Report</h1>
              <p className="text-sm text-slate-500 mt-1">Generated: {reportDate}</p>
            </div>
            <div className="text-right text-sm text-slate-500 space-y-0.5">
              {operator   && <p><span className="font-semibold text-slate-700">Operator:</span> {operator}</p>}
              {instrument && <p><span className="font-semibold text-slate-700">Instrument:</span> {instrument}</p>}
              {stats.dateFrom && <p><span className="font-semibold text-slate-700">Period:</span> {stats.dateFrom.toLocaleDateString()} — {stats.dateTo?.toLocaleDateString()}</p>}
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Total Samples', value: stats.total, color: 'text-slate-900' },
              { label: 'Pass',          value: stats.pass,  color: 'text-emerald-600' },
              { label: 'Warning',       value: stats.warn,  color: 'text-amber-600'   },
              { label: 'Fail',          value: stats.fail,  color: 'text-red-600'     },
            ].map(({ label, value, color }) => (
              <div key={label} className="border border-slate-200 rounded-xl p-4 text-center">
                <p className={`text-3xl font-black ${color}`}>{value}</p>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-1">{label}</p>
              </div>
            ))}
          </div>

          {/* Metrics row */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[
              { label: 'Avg Concentration', value: fmt(stats.avgConc, 2), unit: 'ng/µL' },
              { label: 'Avg 260/280',       value: fmt(stats.avg280,  3), unit: ''      },
              { label: 'Avg 260/230',       value: fmt(stats.avg230,  3), unit: ''      },
            ].map(({ label, value, unit }) => (
              <div key={label} className="bg-slate-50 rounded-xl p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p>
                <p className="text-2xl font-black font-mono text-slate-900">{value} <span className="text-sm font-normal text-slate-400">{unit}</span></p>
              </div>
            ))}
          </div>

          {/* AI summary */}
          {(aiSummary || aiError) && (
            <div className={`mb-8 p-5 rounded-xl border ${aiError ? 'border-red-200 bg-red-50' : 'border-blue-100 bg-blue-50/60'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4" style={{ color: BRAND_COLOR }} />
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">AI-Generated Summary</span>
              </div>
              {aiError
                ? <p className="text-sm text-red-700">{aiError === 'No API key configured' ? 'Add ANTHROPIC_API_KEY to .env.local to enable AI summaries.' : aiError}</p>
                : <p className="text-sm text-slate-700 leading-relaxed">{aiSummary}</p>
              }
            </div>
          )}

          {/* Sample results table */}
          {stats.total === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <p className="font-semibold">No samples in this time range</p>
              <p className="text-sm mt-1">Try expanding the date filter above</p>
            </div>
          ) : (
            <div className="mb-8">
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-3">Sample Results</h2>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-200">
                    <th className="text-left py-2 pr-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Sample</th>
                    <th className="text-left py-2 pr-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Type / App</th>
                    <th className="text-right py-2 pr-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Conc.</th>
                    <th className="text-right py-2 pr-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">260/280</th>
                    <th className="text-right py-2 pr-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">260/230</th>
                    <th className="text-left py-2 pr-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Date</th>
                    <th className="text-center py-2 font-semibold text-slate-600 text-xs uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sampleRows.map(({ s, label, date }, i) => (
                    <tr key={s.id ?? i} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                      <td className="py-2 pr-3 font-medium text-slate-800 max-w-[180px] truncate">{s.sampleName}</td>
                      <td className="py-2 pr-3 text-slate-500 text-xs">{s.application}</td>
                      <td className="py-2 pr-3 text-right font-mono text-slate-700">
                        {s.concentration != null ? s.concentration.toFixed(2) : '—'}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono text-slate-700">
                        {s.ratios?.['260/280'] != null ? s.ratios['260/280'].toFixed(3) : '—'}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono text-slate-700">
                        {s.ratios?.['260/230'] != null ? s.ratios['260/230'].toFixed(3) : '—'}
                      </td>
                      <td className="py-2 pr-3 text-xs text-slate-500">{date?.toLocaleDateString() ?? '—'}</td>
                      <td className="py-2 text-center">
                        {label === 'PASS' && <CheckCircle  className="h-4 w-4 text-emerald-500 mx-auto" />}
                        {label === 'WARN' && <AlertTriangle className="h-4 w-4 text-amber-500 mx-auto" />}
                        {label === 'FAIL' && <XCircle      className="h-4 w-4 text-red-500 mx-auto"     />}
                        {label === 'PASS' && <span className="sr-only">Pass</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Signature block */}
          <div className="mt-12 pt-6 border-t border-slate-200 grid grid-cols-2 gap-12">
            {['Reviewed by', 'Approved by'].map(role => (
              <div key={role}>
                <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6">{role}</p>
                <div className="border-b border-slate-300 mb-2 h-8" />
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Signature</span>
                  <span>Date</span>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-8 text-[10px] text-slate-300 text-center print:text-slate-400">
            DeNovix Data Vault · Generated {reportDate} · {stats.total} sample{stats.total !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
    </div>
  );
};
