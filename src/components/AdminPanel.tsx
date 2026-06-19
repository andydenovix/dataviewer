"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { X, Settings, CheckCircle, ChevronRight, Save, Users, User, ShieldCheck, AlertTriangle } from 'lucide-react';
import { QCProfile, QCThresholds, LabSample } from '../types';
import { Lab } from './labService';
import { QC_PRESETS, DEFAULT_THRESHOLDS, evaluateSampleQC, saveLabQCProfile } from '../lib/qcService';
import { BRAND_COLOR } from '../lib/constants';

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 mb-4 mt-8 first:mt-0">
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{title}</span>
      <div className="flex-1 h-px bg-slate-100" />
    </div>
  );
}

function RangeRow({
  label, hint, fieldMin, fieldMax, thresholds, onChange,
}: {
  label: string;
  hint?: string;
  fieldMin: 'ratio260_280' | 'ratio260_230';
  fieldMax: 'ratio260_280' | 'ratio260_230';
  thresholds: QCThresholds;
  onChange: (t: QCThresholds) => void;
}) {
  const t = thresholds[fieldMin];
  return (
    <div className={`flex items-center gap-4 py-3 border-b border-slate-50 ${!t.enabled ? 'opacity-50' : ''}`}>
      <button
        type="button"
        onClick={() => onChange({ ...thresholds, [fieldMin]: { ...t, enabled: !t.enabled } })}
        className={`w-5 h-5 rounded-full border-2 shrink-0 transition-colors ${t.enabled ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}`}
      >
        {t.enabled && <span className="block w-2 h-2 bg-white rounded-full mx-auto" />}
      </button>
      <div className="w-32 shrink-0">
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-400 text-xs">min</span>
        <input
          type="number"
          step="0.01"
          disabled={!t.enabled}
          value={t.min}
          onChange={e => onChange({ ...thresholds, [fieldMin]: { ...t, min: parseFloat(e.target.value) || 0 } })}
          className="w-20 px-2 py-1.5 border rounded-lg text-center font-mono text-sm disabled:bg-slate-50 focus:ring-2 focus:outline-none"
          style={{ '--tw-ring-color': BRAND_COLOR } as any}
        />
        <span className="text-slate-300">—</span>
        <span className="text-slate-400 text-xs">max</span>
        <input
          type="number"
          step="0.01"
          disabled={!t.enabled}
          value={t.max}
          onChange={e => onChange({ ...thresholds, [fieldMax]: { ...thresholds[fieldMax], max: parseFloat(e.target.value) || 0 } })}
          className="w-20 px-2 py-1.5 border rounded-lg text-center font-mono text-sm disabled:bg-slate-50 focus:ring-2 focus:outline-none"
          style={{ '--tw-ring-color': BRAND_COLOR } as any}
        />
      </div>
    </div>
  );
}

function ValueRow({
  label, hint, field, unit, thresholds, onChange,
}: {
  label: string;
  hint?: string;
  field: 'minConcentration' | 'maxConcentration' | 'maxMethodDelta' | 'minViability' | 'minCellCount';
  unit: string;
  thresholds: QCThresholds;
  onChange: (t: QCThresholds) => void;
}) {
  const t = thresholds[field];
  return (
    <div className={`flex items-center gap-4 py-3 border-b border-slate-50 ${!t.enabled ? 'opacity-50' : ''}`}>
      <button
        type="button"
        onClick={() => onChange({ ...thresholds, [field]: { ...t, enabled: !t.enabled } })}
        className={`w-5 h-5 rounded-full border-2 shrink-0 transition-colors ${t.enabled ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}`}
      >
        {t.enabled && <span className="block w-2 h-2 bg-white rounded-full mx-auto" />}
      </button>
      <div className="w-32 shrink-0">
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <input
          type="number"
          step="any"
          disabled={!t.enabled}
          value={t.value}
          onChange={e => onChange({ ...thresholds, [field]: { ...t, value: parseFloat(e.target.value) || 0 } })}
          className="w-28 px-2 py-1.5 border rounded-lg text-center font-mono text-sm disabled:bg-slate-50 focus:ring-2 focus:outline-none"
          style={{ '--tw-ring-color': BRAND_COLOR } as any}
        />
        <span className="text-slate-500 text-xs">{unit}</span>
      </div>
    </div>
  );
}

// ─── Profile editor ────────────────────────────────────────────────────────────

function ProfileEditor({
  initialProfile,
  contextLabel,
  contextDescription,
  isReadOnly,
  samples,
  onSave,
}: {
  initialProfile: QCProfile | null;
  contextLabel: string;
  contextDescription: string;
  isReadOnly: boolean;
  samples: LabSample[];
  onSave: (p: QCProfile) => Promise<void>;
}) {
  const [draft, setDraft] = useState<QCThresholds>(initialProfile?.thresholds ?? DEFAULT_THRESHOLDS);
  const [profileName, setProfileName] = useState(initialProfile?.name ?? 'General');
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(initialProfile?.name ?? 'General');

  useEffect(() => {
    setDraft(initialProfile?.thresholds ?? DEFAULT_THRESHOLDS);
    setProfileName(initialProfile?.name ?? 'General');
    setActivePreset(initialProfile?.name ?? null);
    setSavedAt(null);
  }, [initialProfile]);

  const handlePreset = (name: string) => {
    setDraft(QC_PRESETS[name]);
    setProfileName(name);
    setActivePreset(name);
  };

  const handleChange = (t: QCThresholds) => {
    setDraft(t);
    setActivePreset(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({ name: profileName, thresholds: draft });
      setSavedAt(new Date());
    } finally {
      setIsSaving(false);
    }
  };

  // Live preview: count how many samples would pass/fail with this draft profile
  const { passing, failing } = useMemo(() => {
    const draftProfile: QCProfile = { name: profileName, thresholds: draft };
    let passing = 0;
    let failing = 0;
    for (const s of samples) {
      const v = evaluateSampleQC(s, draftProfile);
      if (v.length === 0) passing++; else failing++;
    }
    return { passing, failing };
  }, [samples, draft, profileName]);

  return (
    <div className="max-w-2xl">
      {/* Context description */}
      <p className="text-sm text-slate-500 mb-6 leading-relaxed">{contextDescription}</p>

      {/* Presets */}
      <div className="mb-6">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Suggested Presets</p>
        <div className="flex flex-wrap gap-2">
          {Object.keys(QC_PRESETS).map(name => (
            <button
              key={name}
              type="button"
              onClick={() => handlePreset(name)}
              disabled={isReadOnly}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold border transition-all disabled:cursor-not-allowed ${
                activePreset === name
                  ? 'text-white border-transparent shadow-sm'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
              style={activePreset === name ? { backgroundColor: BRAND_COLOR, borderColor: BRAND_COLOR } : {}}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Threshold rows */}
      <div>
        <SectionHeader title="Purity Ratios" />
        <RangeRow label="260/280" hint="DNA: 1.80–2.00 · RNA: 2.00–2.20" fieldMin="ratio260_280" fieldMax="ratio260_280" thresholds={draft} onChange={isReadOnly ? () => {} : handleChange} />
        <RangeRow label="260/230" hint="Typical acceptable: 2.00–2.30" fieldMin="ratio260_230" fieldMax="ratio260_230" thresholds={draft} onChange={isReadOnly ? () => {} : handleChange} />

        <SectionHeader title="Concentration" />
        <ValueRow label="Minimum" hint="Samples below this are flagged" field="minConcentration" unit="(same unit as upload)" thresholds={draft} onChange={isReadOnly ? () => {} : handleChange} />
        <ValueRow label="Maximum" hint="Optional upper ceiling" field="maxConcentration" unit="(same unit as upload)" thresholds={draft} onChange={isReadOnly ? () => {} : handleChange} />

        <SectionHeader title="Method Agreement" />
        <ValueRow label="Max Δ%" hint="Spectro vs Fluorescence delta" field="maxMethodDelta" unit="%" thresholds={draft} onChange={isReadOnly ? () => {} : handleChange} />

        <SectionHeader title="Cell Counting" />
        <ValueRow label="Min Viability" hint="Typical acceptable: ≥80%" field="minViability" unit="%" thresholds={draft} onChange={isReadOnly ? () => {} : handleChange} />
        <ValueRow label="Min Count" hint="cells/mL" field="minCellCount" unit="cells/mL" thresholds={draft} onChange={isReadOnly ? () => {} : handleChange} />
      </div>

      {/* Live preview */}
      {samples.length > 0 && (
        <div className="mt-8 p-5 bg-slate-50 rounded-xl border border-slate-100">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Live Preview — Current Samples</p>
          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
              <span className="text-2xl font-black text-emerald-600">{passing}</span>
              <span className="text-sm text-slate-500">passing</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <span className="text-2xl font-black text-red-500">{failing}</span>
              <span className="text-sm text-slate-500">flagged</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">of {samples.length} total</span>
            </div>
          </div>
          {failing > 0 && (
            <div className="mt-3 h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full transition-all"
                style={{ width: `${(passing / samples.length) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Save */}
      {!isReadOnly && (
        <div className="mt-6 flex items-center gap-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2.5 text-white font-bold rounded-xl shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
            style={{ backgroundColor: BRAND_COLOR }}
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Saving…' : 'Save Profile'}
          </button>
          {savedAt && (
            <span className="text-sm text-emerald-600 font-medium flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4" /> Saved at {savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      )}

      {isReadOnly && (
        <p className="mt-6 text-xs text-slate-400 italic">You can view this group's QC settings but only the group creator can edit them.</p>
      )}
    </div>
  );
}

// ─── Main AdminPanel ───────────────────────────────────────────────────────────

interface AdminPanelProps {
  userId: string;
  personalProfile: QCProfile | null;
  onPersonalSave: (p: QCProfile) => Promise<void>;
  userLabs: Lab[];
  refreshLabs: () => void;
  samples: LabSample[];
  onClose: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  userId,
  personalProfile,
  onPersonalSave,
  userLabs,
  refreshLabs,
  samples,
  onClose,
}) => {
  // 'personal' | labId
  const [activeContext, setActiveContext] = useState<string>('personal');

  const activeLab = userLabs.find(l => l.id === activeContext);
  const isLabAdmin = activeLab?.creatorId === userId;

  const handleLabSave = async (profile: QCProfile) => {
    if (!activeLab) return;
    await saveLabQCProfile(activeLab.id, profile);
    refreshLabs();
  };

  const navItem = (id: string, label: string, icon: React.ReactNode, badge?: string) => (
    <button
      key={id}
      onClick={() => setActiveContext(id)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-colors ${
        activeContext === id ? 'bg-white shadow-sm font-bold' : 'text-slate-500 hover:bg-white/60 hover:text-slate-700'
      }`}
      style={activeContext === id ? { color: BRAND_COLOR } : {}}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {badge && <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full font-bold">{badge}</span>}
    </button>
  );

  let editorProfile: QCProfile | null = null;
  let contextLabel = '';
  let contextDescription = '';
  let isReadOnly = false;
  let onSave = onPersonalSave;

  if (activeContext === 'personal') {
    editorProfile = personalProfile;
    contextLabel = 'My Personal Settings';
    contextDescription = 'These thresholds apply to your private data and flag samples in both hubs. They are only visible to you.';
    onSave = onPersonalSave;
  } else if (activeLab) {
    editorProfile = activeLab.qcProfile ?? null;
    contextLabel = activeLab.name;
    contextDescription = isLabAdmin
      ? `QC thresholds for ${activeLab.name}. All group members see flags when samples fall outside these limits — useful for core facilities enforcing submission standards.`
      : `QC thresholds set by the ${activeLab.name} group admin. Samples shared to this group are flagged against these standards.`;
    isReadOnly = !isLabAdmin;
    onSave = handleLabSave;
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors mr-2"
          >
            <ChevronRight className="h-4 w-4 rotate-180" />
            Back
          </button>
          <div className="w-px h-6 bg-slate-200" />
          <div className="p-2 rounded-lg" style={{ backgroundColor: `${BRAND_COLOR}15` }}>
            <Settings className="h-5 w-5" style={{ color: BRAND_COLOR }} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">QC Settings & Administration</h1>
            <p className="text-xs text-slate-400">Configure quality thresholds for your data and lab groups</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" title="Close (Esc)">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-60 shrink-0 border-r border-slate-200 bg-slate-50/80 p-3 overflow-y-auto">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-3 pt-2 pb-3">Contexts</p>
          {navItem('personal', 'My Settings', <User className="h-4 w-4 shrink-0" />)}

          {userLabs.length > 0 && (
            <>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-3 pt-5 pb-3">Lab Groups</p>
              {userLabs.map(lab =>
                navItem(
                  lab.id,
                  lab.name,
                  <Users className="h-4 w-4 shrink-0" />,
                  lab.creatorId === userId ? 'admin' : undefined
                )
              )}
            </>
          )}
        </div>

        {/* Editor pane */}
        <div className="flex-1 overflow-y-auto p-8">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-sm font-bold mb-6 px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors text-slate-600"
          >
            <ChevronRight className="h-4 w-4 rotate-180" />
            Back to Dashboard
          </button>

          <div className="flex items-center gap-2 mb-6">
            {activeContext === 'personal'
              ? <User className="h-5 w-5" style={{ color: BRAND_COLOR }} />
              : <Users className="h-5 w-5 text-purple-500" />}
            <h2 className="text-xl font-bold text-slate-800">{contextLabel}</h2>
            {isReadOnly && (
              <span className="text-[10px] px-2 py-1 bg-slate-100 text-slate-500 rounded-full font-bold uppercase tracking-wider">read-only</span>
            )}
          </div>

          <ProfileEditor
            key={activeContext}
            initialProfile={editorProfile}
            contextLabel={contextLabel}
            contextDescription={contextDescription}
            isReadOnly={isReadOnly}
            samples={samples}
            onSave={onSave}
          />
        </div>
      </div>
    </div>
  );
};
