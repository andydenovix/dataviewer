"use client";

import React, { useState, useEffect } from 'react';
import { Protocol } from '../types';
import { BRAND_COLOR } from '@/lib/constants';
import { QC_PRESETS } from '@/lib/qcService';
import { createProtocol, updateProtocol, deleteProtocol } from '@/lib/protocolService';
import { ArrowLeft, Plus, FlaskConical, Trash2, Save, CheckCircle } from 'lucide-react';

const SAMPLE_TYPES = ['', 'spectro', 'fluor', 'cell-count', 'image'] as const;
const SAMPLE_TYPE_LABELS: Record<string, string> = {
  '': 'Any',
  spectro: 'Spectrophotometry',
  fluor: 'Fluorometry',
  'cell-count': 'Cell Counting',
  image: 'Image Analysis',
};

const REQUIRED_FIELD_OPTIONS = [
  { key: 'concentration', label: 'Concentration' },
  { key: '260/280',       label: '260/280 Ratio' },
  { key: '260/230',       label: '260/230 Ratio' },
  { key: 'viability',     label: 'Cell Viability' },
  { key: 'cellCount',     label: 'Cell Count' },
];

const EMPTY_DRAFT: Omit<Protocol, 'id' | 'userId' | 'createdAt'> = {
  name: '',
  description: '',
  kitName: '',
  sampleType: '',
  application: '',
  qcPreset: 'General',
  requiredFields: [],
  operatorNotes: '',
};

interface ProtocolManagerProps {
  userId: string;
  protocols: Protocol[];
  onClose: () => void;
}

export const ProtocolManager: React.FC<ProtocolManagerProps> = ({ userId, protocols, onClose }) => {
  const [selectedId, setSelectedId]   = useState<string | 'new' | null>(null);
  const [draft, setDraft]             = useState<Omit<Protocol, 'id' | 'userId' | 'createdAt'>>(EMPTY_DRAFT);
  const [saving, setSaving]           = useState(false);
  const [savedAt, setSavedAt]         = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Escape to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  // Load protocol into draft when selection changes
  useEffect(() => {
    if (selectedId === 'new') {
      setDraft(EMPTY_DRAFT);
      setConfirmDelete(false);
      setSavedAt(null);
    } else if (selectedId) {
      const p = protocols.find(p => p.id === selectedId);
      if (p) {
        const { id, userId, createdAt, ...rest } = p;
        setDraft(rest);
        setConfirmDelete(false);
        setSavedAt(null);
      }
    }
  }, [selectedId, protocols]);

  const handleSave = async () => {
    if (!draft.name.trim()) return;
    setSaving(true);
    try {
      if (selectedId === 'new') {
        const newId = await createProtocol(userId, draft);
        setSelectedId(newId);
      } else if (selectedId) {
        await updateProtocol(selectedId, draft);
      }
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId || selectedId === 'new') return;
    await deleteProtocol(selectedId);
    setSelectedId(null);
    setConfirmDelete(false);
  };

  const toggleRequired = (key: string) => {
    setDraft(d => ({
      ...d,
      requiredFields: d.requiredFields.includes(key)
        ? d.requiredFields.filter(f => f !== key)
        : [...d.requiredFields, key],
    }));
  };

  const selected = selectedId && selectedId !== 'new'
    ? protocols.find(p => p.id === selectedId)
    : null;

  return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 px-6 py-4 flex items-center gap-3 shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="w-px h-5 bg-slate-200" />
        <FlaskConical className="h-5 w-5" style={{ color: BRAND_COLOR }} />
        <h1 className="text-base font-bold text-slate-900 mr-auto">Protocol Templates</h1>
        <p className="text-xs text-slate-400 hidden sm:block">Define named protocols to auto-apply QC profiles and pre-fill metadata on upload</p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 shrink-0 border-r border-slate-200 bg-slate-50/80 flex flex-col">
          <div className="p-3 border-b border-slate-100">
            <button
              onClick={() => setSelectedId('new')}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-colors text-white"
              style={{ backgroundColor: BRAND_COLOR }}
            >
              <Plus className="h-4 w-4" /> New Protocol
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {protocols.length === 0 && selectedId !== 'new' && (
              <p className="text-xs text-slate-400 px-3 py-4 text-center">No protocols yet — create one to get started</p>
            )}
            {protocols.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id!)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors mb-0.5 ${
                  selectedId === p.id
                    ? 'bg-white shadow-sm font-bold'
                    : 'text-slate-600 hover:bg-white/60'
                }`}
                style={selectedId === p.id ? { color: BRAND_COLOR } : {}}
              >
                <p className="font-semibold truncate">{p.name}</p>
                {p.kitName && <p className="text-[11px] text-slate-400 truncate mt-0.5">{p.kitName}</p>}
              </button>
            ))}
          </div>
        </div>

        {/* Editor */}
        {selectedId == null ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400">
            <button
              onClick={onClose}
              className="flex items-center gap-2 text-sm font-bold mb-8 px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors text-slate-600"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Dashboard
            </button>
            <FlaskConical className="h-14 w-14 mx-auto mb-4 opacity-20" />
            <p className="font-semibold text-slate-500">Select a protocol or create a new one</p>
            <p className="text-sm mt-1">Protocols auto-apply QC thresholds and tag samples on upload</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-8 max-w-2xl">
            <button
              onClick={onClose}
              className="flex items-center gap-2 text-sm font-bold mb-6 px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors text-slate-600"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Dashboard
            </button>
            <div className="mb-8">
              <h2 className="text-xl font-bold text-slate-800 mb-1">
                {selectedId === 'new' ? 'New Protocol' : (selected?.name || 'Edit Protocol')}
              </h2>
              <p className="text-sm text-slate-400">
                Saved protocols appear in the upload panel so operators can tag samples and auto-apply QC settings.
              </p>
            </div>

            {/* Basic info */}
            <section className="mb-6">
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Protocol Identity</label>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Protocol name *</label>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                    placeholder="e.g. RNA extraction — RNEasy kit"
                    className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2"
                    style={{ '--tw-ring-color': BRAND_COLOR } as any}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Kit / reagent name</label>
                  <input
                    type="text"
                    value={draft.kitName}
                    onChange={e => setDraft(d => ({ ...d, kitName: e.target.value }))}
                    placeholder="e.g. Qiagen RNEasy Mini Kit"
                    className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2"
                    style={{ '--tw-ring-color': BRAND_COLOR } as any}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
                  <textarea
                    value={draft.description}
                    onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                    placeholder="Brief description of this protocol…"
                    rows={2}
                    className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 resize-none"
                    style={{ '--tw-ring-color': BRAND_COLOR } as any}
                  />
                </div>
              </div>
            </section>

            {/* Sample classification */}
            <section className="mb-6">
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Sample Classification</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Sample type</label>
                  <select
                    value={draft.sampleType}
                    onChange={e => setDraft(d => ({ ...d, sampleType: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm outline-none bg-white"
                  >
                    {SAMPLE_TYPES.map(t => (
                      <option key={t} value={t}>{SAMPLE_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Application</label>
                  <input
                    type="text"
                    value={draft.application}
                    onChange={e => setDraft(d => ({ ...d, application: e.target.value }))}
                    placeholder="e.g. RNA, dsDNA, Protein…"
                    className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2"
                    style={{ '--tw-ring-color': BRAND_COLOR } as any}
                  />
                </div>
              </div>
            </section>

            {/* QC preset */}
            <section className="mb-6">
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">QC Profile</label>
              <p className="text-xs text-slate-400 mb-3">Samples uploaded under this protocol will be evaluated against the selected QC preset.</p>
              <div className="grid grid-cols-3 gap-2">
                {['None', ...Object.keys(QC_PRESETS)].map(preset => (
                  <button
                    key={preset}
                    onClick={() => setDraft(d => ({ ...d, qcPreset: preset }))}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      draft.qcPreset === preset
                        ? 'text-white border-transparent'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                    style={draft.qcPreset === preset ? { backgroundColor: BRAND_COLOR } : {}}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </section>

            {/* Required fields */}
            <section className="mb-6">
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Required Measurements</label>
              <p className="text-xs text-slate-400 mb-3">Uploads under this protocol will be warned if these fields are missing.</p>
              <div className="space-y-2">
                {REQUIRED_FIELD_OPTIONS.map(({ key, label }) => {
                  const checked = draft.requiredFields.includes(key);
                  return (
                    <label key={key} className="flex items-center gap-3 cursor-pointer group">
                      <button
                        type="button"
                        onClick={() => toggleRequired(key)}
                        className={`w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                          checked ? 'border-transparent' : 'border-slate-300 bg-white'
                        }`}
                        style={checked ? { backgroundColor: BRAND_COLOR, borderColor: BRAND_COLOR } : {}}
                      >
                        {checked && <CheckCircle className="h-3.5 w-3.5 text-white" />}
                      </button>
                      <span className={`text-sm ${checked ? 'font-semibold text-slate-800' : 'text-slate-500'}`}>{label}</span>
                    </label>
                  );
                })}
              </div>
            </section>

            {/* Operator notes */}
            <section className="mb-8">
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Operator Notes</label>
              <p className="text-xs text-slate-400 mb-3">These notes will be pre-filled for operators when uploading under this protocol.</p>
              <textarea
                value={draft.operatorNotes}
                onChange={e => setDraft(d => ({ ...d, operatorNotes: e.target.value }))}
                placeholder="Centrifuge at 300×g for 10 min. Measure within 30 min of extraction…"
                rows={4}
                className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 resize-none"
                style={{ '--tw-ring-color': BRAND_COLOR } as any}
              />
            </section>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={!draft.name.trim() || saving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-bold disabled:opacity-50 transition-all"
                style={{ backgroundColor: BRAND_COLOR }}
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving…' : 'Save Protocol'}
              </button>

              {savedAt && (
                <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-semibold">
                  <CheckCircle className="h-4 w-4" /> Saved
                </span>
              )}

              {selectedId !== 'new' && !confirmDelete && (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="ml-auto flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              )}
              {confirmDelete && (
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-sm text-red-600 font-semibold">Delete this protocol?</span>
                  <button onClick={handleDelete} className="px-3 py-1.5 bg-red-600 text-white text-sm font-bold rounded-lg">Yes, delete</button>
                  <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 border text-sm font-semibold rounded-lg">Cancel</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
