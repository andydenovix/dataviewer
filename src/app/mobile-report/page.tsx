"use client";

import React, { useState, useMemo, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Calculator, Loader2, Copy, Check, AlertCircle, Beaker, Activity } from 'lucide-react';
import { BRAND_COLOR } from '@/lib/constants';

interface SummaryQuantSample {
  type: 'quant';
  n: string;
  c: number | undefined;
  u: string;
  r1: number | undefined;
  r2: number | undefined;
}

interface SummaryCellSample {
  type: 'cell';
  n: string;
  t: number | undefined;
  v: number | undefined;
  d: number | undefined;
}

type QRParsedSample = SummaryQuantSample | SummaryCellSample;

interface QRDataPayload {
  v: number;
  ts: number;
  d: QRParsedSample[];
}

// ── Small copy-to-clipboard button ───────────────────────────────────────────
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }, [value]);
  return (
    <button
      onClick={copy}
      className="ml-2 p-1.5 rounded-lg bg-white/60 hover:bg-white transition-colors shrink-0"
      title="Copy"
    >
      {copied
        ? <Check className="h-3.5 w-3.5 text-emerald-600" />
        : <Copy className="h-3.5 w-3.5 text-slate-400" />}
    </button>
  );
}

// ── Ratio badge with colour coding ───────────────────────────────────────────
function RatioBadge({ label, value }: { label: string; value: number | undefined }) {
  if (value == null) return null;
  const ok = value >= 1.7 && value <= 2.1;
  return (
    <div className={`flex flex-col items-center px-3 py-1.5 rounded-lg ${ok ? 'bg-emerald-50' : 'bg-amber-50'}`}>
      <span className={`text-[10px] font-black uppercase tracking-wider ${ok ? 'text-emerald-500' : 'text-amber-500'}`}>{label}</span>
      <span className={`text-base font-mono font-bold ${ok ? 'text-emerald-700' : 'text-amber-700'}`}>{value.toFixed(2)}</span>
    </div>
  );
}

// ── Per-sample card ───────────────────────────────────────────────────────────
function SampleCard({
  sample,
  index,
  dilution,
}: {
  sample: QRParsedSample;
  index: number;
  dilution: { v1: string; vDil: string } | { error: string } | null;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      {/* Card header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Sample {index + 1}
          </span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            sample.type === 'cell'
              ? 'bg-purple-100 text-purple-600'
              : 'bg-blue-100 text-blue-600'
          }`}>
            {sample.type === 'cell' ? 'Cell Count' : 'Quant'}
          </span>
        </div>
        <h3 className="text-base font-bold text-slate-900 leading-tight">{sample.n}</h3>
      </div>

      {/* Metrics */}
      <div className="px-4 py-3">
        {sample.type === 'quant' ? (
          <>
            {/* Concentration — primary metric */}
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-3xl font-black font-mono text-slate-900">
                {sample.c != null ? sample.c.toFixed(2) : '—'}
              </span>
              <span className="text-sm font-bold text-slate-400">{sample.u || 'ng/µL'}</span>
              {sample.c != null && <CopyButton value={`${sample.c.toFixed(2)} ${sample.u}`} />}
            </div>
            {/* Ratio badges */}
            {(sample.r1 != null || sample.r2 != null) && (
              <div className="flex gap-2">
                <RatioBadge label="260/280" value={sample.r1} />
                <RatioBadge label="260/230" value={sample.r2} />
              </div>
            )}
          </>
        ) : (
          <>
            {/* Total cells */}
            {sample.t != null && (
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-2xl font-black font-mono text-slate-900">
                  {sample.t.toLocaleString()}
                </span>
                <span className="text-sm font-bold text-slate-400">cells/mL</span>
                <CopyButton value={sample.t.toLocaleString()} />
              </div>
            )}
            <div className="flex gap-2">
              {sample.v != null && (
                <div className={`flex flex-col items-center px-3 py-1.5 rounded-lg ${sample.v >= 80 ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                  <span className={`text-[10px] font-black uppercase tracking-wider ${sample.v >= 80 ? 'text-emerald-500' : 'text-amber-500'}`}>Viability</span>
                  <span className={`text-base font-mono font-bold ${sample.v >= 80 ? 'text-emerald-700' : 'text-amber-700'}`}>{sample.v.toFixed(1)}%</span>
                </div>
              )}
              {sample.d != null && (
                <div className="flex flex-col items-center px-3 py-1.5 rounded-lg bg-slate-50">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Mean Dia.</span>
                  <span className="text-base font-mono font-bold text-slate-700">{sample.d.toFixed(1)} µm</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Dilution result — only shown for quant samples when calculator is filled */}
      {dilution && sample.type === 'quant' && (
        <div className={`mx-4 mb-4 rounded-xl p-3 ${'error' in dilution ? 'bg-red-50 border border-red-100' : 'bg-emerald-50 border border-emerald-100'}`}>
          {'error' in dilution ? (
            <p className="text-sm text-red-600 font-medium flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 shrink-0" /> {dilution.error}
            </p>
          ) : (
            <>
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-2">Dilution Plan</p>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center justify-between bg-white rounded-lg px-3 py-2">
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Stock</p>
                    <p className="text-lg font-black font-mono text-slate-900">{dilution.v1} <span className="text-xs font-normal text-slate-500">µL</span></p>
                  </div>
                  <CopyButton value={`${dilution.v1} µL`} />
                </div>
                <div className="flex items-center text-slate-300 font-bold text-lg">+</div>
                <div className="flex-1 flex items-center justify-between bg-white rounded-lg px-3 py-2">
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Buffer</p>
                    <p className="text-lg font-black font-mono text-slate-900">{dilution.vDil} <span className="text-xs font-normal text-slate-500">µL</span></p>
                  </div>
                  <CopyButton value={`${dilution.vDil} µL`} />
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main content (needs Suspense boundary due to useSearchParams) ─────────────
function MobileReportContent() {
  const searchParams = useSearchParams();
  const [parsedData, setParsedData] = useState<QRDataPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [targetConc, setTargetConc] = useState('');
  const [targetVol, setTargetVol] = useState('');
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const importData = searchParams.get('import');
    if (!importData) {
      setError('No data found in this URL. Please scan a valid DeNovix QR code.');
      return;
    }
    try {
      const decoded = JSON.parse(decodeURIComponent(importData));
      if (decoded?.v === 1 && Array.isArray(decoded.d)) {
        setParsedData(decoded);
        setShowBanner(true);
        setTimeout(() => setShowBanner(false), 3000);
      } else {
        setError('Invalid data format in QR code.');
      }
    } catch {
      setError('Failed to read QR data. Please scan again.');
    }
  }, [searchParams]);

  const dilutionResults = useMemo(() => {
    if (!targetConc || !targetVol || !parsedData) return null;
    const c2 = parseFloat(targetConc);
    const v2 = parseFloat(targetVol);
    if (isNaN(c2) || isNaN(v2) || c2 <= 0 || v2 <= 0) return null;

    return parsedData.d.map(s => {
      if (s.type !== 'quant') return null;
      const c1 = s.c ?? 0;
      if (c1 <= 0) return { error: 'Stock concentration is zero' };
      if (c1 <= c2) return { error: `Stock (${c1.toFixed(1)}) is below target` };
      const v1 = (c2 * v2) / c1;
      return { v1: v1.toFixed(2), vDil: (v2 - v1).toFixed(2) };
    });
  }, [parsedData, targetConc, targetVol]);

  const hasQuantSamples = parsedData?.d.some(s => s.type === 'quant');

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-7 w-7 text-red-500" />
          </div>
          <h1 className="text-lg font-bold text-slate-900 mb-2">Couldn't load report</h1>
          <p className="text-sm text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!parsedData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: BRAND_COLOR }} />
          <p className="text-sm text-slate-500 font-medium">Loading report…</p>
        </div>
      </div>
    );
  }

  const generatedAt = new Date(parsedData.ts * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const quantCount = parsedData.d.filter(s => s.type === 'quant').length;
  const cellCount = parsedData.d.filter(s => s.type === 'cell').length;

  return (
    <div className="min-h-screen bg-slate-100">
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 shadow-md" style={{ backgroundColor: BRAND_COLOR }}>
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center gap-2 mb-1">
            <Beaker className="h-4 w-4 text-white/70" />
            <span className="text-xs font-bold text-white/70 uppercase tracking-widest">DeNovix Data Vault</span>
          </div>
          <h1 className="text-xl font-black text-white">Lab Report</h1>
          <p className="text-xs text-white/60 mt-0.5">{generatedAt}</p>
        </div>

        {/* Sample type summary chips */}
        <div className="px-4 pb-3 flex gap-2">
          {quantCount > 0 && (
            <div className="flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1">
              <Activity className="h-3 w-3 text-white" />
              <span className="text-xs font-bold text-white">{quantCount} Quant</span>
            </div>
          )}
          {cellCount > 0 && (
            <div className="flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1">
              <Activity className="h-3 w-3 text-white" />
              <span className="text-xs font-bold text-white">{cellCount} Cell Count</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Success banner (auto-dismisses) ── */}
      <div
        className={`overflow-hidden transition-all duration-500 ${showBanner ? 'max-h-16 opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="bg-emerald-500 text-white px-4 py-3 flex items-center gap-2 text-sm font-bold">
          <Check className="h-4 w-4 shrink-0" />
          {parsedData.d.length} sample{parsedData.d.length !== 1 ? 's' : ''} loaded successfully
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 pb-12">
        {/* ── Dilution calculator (shown only if any quant samples) ── */}
        {hasQuantSamples && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-4 pt-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4" style={{ color: BRAND_COLOR }} />
                <span className="font-bold text-slate-800 text-sm">Dilution Planner</span>
                <span className="text-[10px] text-slate-400 font-mono">C₁V₁ = C₂V₂</span>
              </div>
            </div>
            <div className="px-4 py-4 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: BRAND_COLOR }}>
                  Target Conc (C₂)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="e.g. 10"
                    className="w-full px-3 py-3 rounded-xl border border-slate-200 text-base font-mono font-bold focus:ring-2 outline-none bg-slate-50"
                    style={{ '--tw-ring-color': BRAND_COLOR } as any}
                    value={targetConc}
                    onChange={e => setTargetConc(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: BRAND_COLOR }}>
                  Target Vol (V₂) µL
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="e.g. 50"
                  className="w-full px-3 py-3 rounded-xl border border-slate-200 text-base font-mono font-bold focus:ring-2 outline-none bg-slate-50"
                  style={{ '--tw-ring-color': BRAND_COLOR } as any}
                  value={targetVol}
                  onChange={e => setTargetVol(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Sample cards ── */}
        {parsedData.d.map((sample, i) => (
          <SampleCard
            key={i}
            sample={sample}
            index={i}
            dilution={dilutionResults ? dilutionResults[i] : null}
          />
        ))}
      </div>
    </div>
  );
}

// ── Page wrapper with Suspense (required by Next.js for useSearchParams) ──────
export default function MobileReportPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-100">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      }
    >
      <MobileReportContent />
    </Suspense>
  );
}
