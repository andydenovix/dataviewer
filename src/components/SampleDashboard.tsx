"use client";

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { LabSample } from '../types';
import { convertFirestoreTimestampToDate } from '@/lib/utils';
import { exportSamplesToCSV } from '@/lib/exportUtils';
import { useAuth } from '@/lib/AuthContext';
import { useSamples, PAGE_SIZE } from '@/hooks/useSamples';
import { useProjects } from '@/hooks/useProjects';
import { useLabs } from '@/hooks/useLabs';
import { useDashboardFilters } from '@/hooks/useDashboardFilters';
import { useDashboardModals } from '@/hooks/useDashboardModals';
import { SpectralPlot } from './SpectralPlot';
import { FileUpload } from './FileUpload';
import { ErrorBoundary } from './ErrorBoundary';
import { Search, ChevronDown, ChevronRight, Edit2, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown, Trash2, AlertTriangle, Layers, X, Beaker, Printer, Folder, Share2, Users, Smartphone, Settings, ShieldCheck, AlignJustify, Download, RotateCcw, Clock, ChevronsDown, TrendingUp, Activity, FlaskConical, FileText, Scan, PlayCircle } from 'lucide-react';
import { AdminPanel } from './AdminPanel';
import { usePersonalQCProfile } from '@/hooks/usePersonalQCProfile';
import { evaluateSampleQC } from '@/lib/qcService';
import { QCViolation } from '../types';
import { ReplicateManager } from './ReplicateManager';
import { createProject } from '@/lib/projectService';
import { shareSamplesWithLab, createLab, joinLab, deleteLab } from './labService';
import { RatioDisplay } from './RatioDisplay';
import { QCMatcher } from './QCMatcher';
import { QCView } from './QCView';
import { SampleViewer } from './SampleViewer';
import { CellCountComparison } from './CellCountComparison';
import { QRReportModal } from './QRReportModal';
import { BRAND_COLOR } from '@/lib/constants';
import { TrendChart } from './TrendChart';
import { LeveyJenningsChart } from './LeveyJenningsChart';
import { ProtocolManager } from './ProtocolManager';
import { BatchReportModal } from './BatchReportModal';
import { useProtocols } from '@/hooks/useProtocols';
import { useReferenceSpectra } from '@/hooks/useReferenceSpectra';
import { SpectralFingerprintPanel } from './SpectralFingerprintPanel';
import { seedDemoData, clearDemoData } from '@/lib/demoData';

const SortIcon = ({ field, currentKey, direction }: { field: string; currentKey: string; direction: 'asc' | 'desc' }) => {
  if (currentKey !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-20" />;
  return direction === 'asc' ? <ArrowUp className="h-3 w-3 ml-1 text-blue-600" /> : <ArrowDown className="h-3 w-3 ml-1 text-blue-600" />;
};

const ThSortable = ({
  label, field, sortConfig, onSort, center = false, pad = 'p-4',
}: {
  label: string;
  field: keyof LabSample | 'measuredAt';
  sortConfig: { key: keyof LabSample | 'measuredAt'; direction: 'asc' | 'desc' };
  onSort: (f: keyof LabSample | 'measuredAt') => void;
  center?: boolean;
  pad?: string;
}) => (
  <th
    className={`${pad} font-semibold cursor-pointer hover:bg-slate-100 transition-colors ${center ? 'text-center' : ''}`}
    onClick={() => onSort(field)}
  >
    <div className={`flex items-center ${center ? 'justify-center' : ''}`}>
      {label} <SortIcon field={field} currentKey={sortConfig.key} direction={sortConfig.direction} />
    </div>
  </th>
);

const Sparkline = React.memo(({ wavelengths, absorbance }: { wavelengths: number[]; absorbance: number[] }) => {
  if (!wavelengths.length || !absorbance.length) return null;
  const step = Math.max(1, Math.floor(wavelengths.length / 40));
  const wx = wavelengths.filter((_, i) => i % step === 0);
  const ab = absorbance.filter((_, i) => i % step === 0);
  const W = 56, H = 18;
  const minW = wx[0], rangeW = (wx[wx.length - 1] - minW) || 1;
  const minA = Math.min(...ab), rangeA = (Math.max(...ab) - minA) || 1;
  const pts = wx.map((w, i) => `${(((w - minW) / rangeW) * W).toFixed(1)},${(H - (((ab[i] - minA) / rangeA) * (H - 2)) - 1).toFixed(1)}`).join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="inline-block align-middle ml-2 opacity-40 shrink-0">
      <polyline points={pts} fill="none" stroke={BRAND_COLOR} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
});
Sparkline.displayName = 'Sparkline';

function DashboardSkeleton() {
  return (
    <div className="w-full space-y-6 animate-pulse">
      <div className="px-1">
        <div className="h-8 w-52 bg-slate-200 rounded-lg mb-2" />
        <div className="h-4 w-80 bg-slate-100 rounded" />
      </div>
      <div className="flex gap-2">
        <div className="h-10 w-44 bg-slate-200 rounded-xl" />
        <div className="h-10 w-44 bg-slate-100 rounded-xl" />
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-100">
          <div className="flex-1 h-12 bg-slate-50" /><div className="flex-1 h-12 bg-white" />
        </div>
        <div className="p-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex gap-3">
            <div className="h-9 w-64 bg-slate-200 rounded-md" />
            <div className="h-9 w-28 bg-slate-200 rounded-md" />
            <div className="h-9 w-36 bg-slate-200 rounded-md" />
          </div>
        </div>
        <div>
          {[72, 56, 64, 80, 60, 56, 72, 56].map((w, i) => (
            <div key={i} className={`flex items-center gap-4 px-4 py-3.5 border-b border-slate-100 ${i % 2 === 1 ? 'bg-slate-50/40' : ''}`}>
              <div className="w-4 h-4 bg-slate-200 rounded shrink-0" />
              <div className={`h-4 bg-slate-200 rounded`} style={{ width: `${w}px` }} />
              <div className="h-4 w-20 bg-slate-100 rounded" />
              <div className="h-4 w-16 bg-slate-100 rounded" />
              <div className="h-4 w-16 bg-slate-100 rounded" />
              <div className="h-4 w-16 bg-slate-100 rounded" />
              <div className="h-3 w-3 bg-slate-200 rounded-full ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onLoadDemo, isDemoLoading }: { onLoadDemo: () => void; isDemoLoading: boolean }) {
  return (
    <div className="w-full min-h-[55vh] flex items-center justify-center py-16">
      <div className="text-center max-w-sm mx-auto">
        <div className="relative mx-auto w-28 h-28 mb-8">
          <div className="absolute inset-0 rounded-3xl rotate-6 opacity-15" style={{ backgroundColor: BRAND_COLOR }} />
          <div className="absolute inset-0 rounded-3xl -rotate-3 opacity-10" style={{ backgroundColor: BRAND_COLOR }} />
          <div className="relative flex items-center justify-center w-full h-full rounded-3xl border-2 border-dashed" style={{ borderColor: `${BRAND_COLOR}55` }}>
            <Beaker className="h-11 w-11" style={{ color: BRAND_COLOR, opacity: 0.7 }} />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">No data yet</h2>
        <p className="text-slate-500 text-sm mb-8 leading-relaxed">
          Upload your first DeNovix export to get started. Supports CSV, Excel, and image bundles from UV-Vis and CellDrop instruments.
        </p>
        <div className="max-w-xs mx-auto">
          <FileUpload />
        </div>
        <div className="mt-6 flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-xs text-slate-400 font-medium">or</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>
        <button
          onClick={onLoadDemo}
          disabled={isDemoLoading}
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border text-sm font-bold transition-all hover:bg-violet-50 disabled:opacity-50"
          style={{ color: '#7c3aed', borderColor: '#c4b5fd', backgroundColor: '#f5f3ff' }}
        >
          <PlayCircle className="h-4 w-4" />
          {isDemoLoading ? 'Loading demo…' : 'Explore with Demo Data'}
        </button>
        <p className="mt-2 text-[11px] text-slate-400">45 sample records across 3 protocols — removable any time</p>
      </div>
    </div>
  );
}

export const SampleDashboard: React.FC = () => {
  const { user } = useAuth();

  // --- Hub / view state ---
  const [activeHub, setActiveHub] = useState<'quant' | 'cell'>('quant');
  const [viewMode, setViewMode] = useState<'private' | 'groups'>('private');
  const [selectedLabId, setSelectedLabId] = useState<string | null>(null);

  // --- Data via hooks ---
  const { samples: rawSamples, loading, loadingMore, error, hasMore, loadMore } = useSamples(user, viewMode, selectedLabId);
  const { projects, refresh: refreshProjects } = useProjects(user?.uid);
  const { labs: userLabs, refresh: refreshLabs } = useLabs(user?.uid);
  const protocols = useProtocols(user);
  const referenceSpectra = useReferenceSpectra(user);
  const hasDemoData = rawSamples.some(s => s.isDemo);
  const demoSampleCount = rawSamples.filter(s => s.isDemo).length;

  // Undo-delete: track IDs optimistically hidden before Firestore confirms deletion
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
  const pendingDeleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(() => () => { pendingDeleteTimers.current.forEach(clearTimeout); }, []);

  // Filter out pending-delete samples so they disappear immediately
  const samples = useMemo(
    () => rawSamples.filter(s => !pendingDeleteIds.has(s.id!)),
    [rawSamples, pendingDeleteIds]
  );

  // Hub-scoped views passed to analytical workflow modals
  const isQuantSample = (s: LabSample) => s.sampleType !== 'cell-count';
  const isCellSample  = (s: LabSample) => s.sampleType === 'cell-count';
  const hubFilter = activeHub === 'quant' ? isQuantSample : isCellSample;
  const hubSamples    = useMemo(() => samples.filter(hubFilter),    [samples, activeHub]);
  const hubRawSamples = useMemo(() => rawSamples.filter(hubFilter), [rawSamples, activeHub]);

  // --- Selection & editing ---
  const [selectedSampleIds, setSelectedSampleIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // --- Filters & sort (extracted hook) ---
  const filters = useDashboardFilters({
    samples,
    activeHub,
    userId: user?.uid,
    refreshProjects,
  });

  // --- Modal state (extracted hook) ---
  const modals = useDashboardModals();

  // --- QC profiles ---
  const { profile: personalQCProfile, save: savePersonalQCProfile } = usePersonalQCProfile(user?.uid);
  const [qrBaseUrl, setQrBaseUrl] = useState<string>('');

  // Active profile: lab profile when in groups view, personal otherwise
  const activeQCProfile = useMemo(() => {
    if (viewMode === 'groups' && selectedLabId) {
      return userLabs.find(l => l.id === selectedLabId)?.qcProfile ?? null;
    }
    return personalQCProfile;
  }, [viewMode, selectedLabId, userLabs, personalQCProfile]);

  // Per-sample QC violations — keyed by ID so sort/filter changes don't trigger recomputation
  const sampleViolations = useMemo((): Map<string, QCViolation[]> => {
    if (!activeQCProfile) return new Map();
    const map = new Map<string, QCViolation[]>();
    for (const s of samples) {
      const v = evaluateSampleQC(s, activeQCProfile);
      if (v.length > 0) map.set(s.id!, v);
    }
    return map;
  }, [samples, activeQCProfile]);

  // --- UI feedback ---
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'undo'; onUndo?: () => void } | null>(null);
  const [density, setDensity] = useState<'compact' | 'comfortable' | 'spacious'>(() => {
    if (typeof window === 'undefined') return 'comfortable';
    return (localStorage.getItem('dv_density') as any) || 'comfortable';
  });
  const tdPad = density === 'compact' ? 'p-2 py-2.5' : density === 'spacious' ? 'p-5' : 'p-4';

  const showToast = (message: string, type: 'success' | 'error' | 'undo', onUndo?: () => void) => {
    setToast({ message, type, onUndo });
    setTimeout(() => setToast(null), type === 'undo' ? 5500 : 3000);
  };

  // --- Derived data ---
  const viewingSample = useMemo(
    () => (modals.viewingSampleId ? samples.find(s => s.id === modals.viewingSampleId) : null),
    [modals.viewingSampleId, samples]
  );

  const getFuzzy = (meta: any, part: string) => {
    if (!meta) return undefined;
    const partClean = part.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const entry = Object.entries(meta).find(([k]) =>
      k.toUpperCase().replace(/[^A-Z0-9]/g, '').includes(partClean)
    );
    return entry ? entry[1] : undefined;
  };

  // --- Handlers ---
  const handleSelectSample = (sampleId: string) => {
    setSelectedSampleIds(prev =>
      prev.includes(sampleId) ? prev.filter(id => id !== sampleId) : [...prev, sampleId]
    );
  };

  const toggleSelectAll = () => {
    setSelectedSampleIds(
      selectedSampleIds.length === filters.filteredSamples.length
        ? []
        : filters.filteredSamples.map(s => s.id!)
    );
  };

  const handleRename = async (id: string, newName: string) => {
    try {
      await updateDoc(doc(db, 'samples', id), {
        sampleName: newName,
        lastModifiedBy: user?.email || user?.uid || 'unknown',
        lastModifiedAt: serverTimestamp(),
      });
      setEditingId(null);
    } catch (err) {
      console.error('Rename failed', err);
      alert('Failed to rename sample.');
    }
  };

  const handleBulkAssignProject = async (projectId: string | null) => {
    if (selectedSampleIds.length === 0 || !user) return;
    setIsActionLoading(true);
    try {
      const batch = writeBatch(db);
      selectedSampleIds.forEach(id => {
        batch.update(doc(db, 'samples', id), {
          projectId,
          lastModifiedBy: user.email || user.uid,
          lastModifiedAt: serverTimestamp(),
        });
      });
      await batch.commit();
      const label = projectId ? projects.find(p => p.id === projectId)?.name ?? 'project' : 'Unassigned';
      showToast(`${selectedSampleIds.length} sample(s) assigned to ${label}`, 'success');
      setSelectedSampleIds([]);
    } catch {
      showToast('Failed to assign project.', 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleShareWithLab = async (labId?: string) => {
    if (userLabs.length === 0 || selectedSampleIds.length === 0 || !user) return;
    const targetLabId = labId || (userLabs.length === 1 ? userLabs[0].id : null);
    if (!targetLabId) return;
    const targetLab = userLabs.find(l => l.id === targetLabId);
    if (!targetLab) return;
    if (!window.confirm(`Share ${selectedSampleIds.length} samples with ${targetLab.name}?`)) return;

    setIsActionLoading(true);
    try {
      await shareSamplesWithLab(
        selectedSampleIds,
        targetLab.id,
        user.uid,
        user.displayName || user.email || 'A colleague'
      );
      showToast(`Successfully shared with ${targetLab.name}!`, 'success');
      setSelectedSampleIds([]);
    } catch {
      showToast('Failed to share data.', 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDeleteSelected = () => {
    const ids = [...selectedSampleIds];
    if (ids.length === 0) return;

    // Optimistically hide the rows immediately
    setPendingDeleteIds(prev => new Set([...prev, ...ids]));
    if (expandedRow && ids.includes(expandedRow)) setExpandedRow(null);
    setSelectedSampleIds([]);

    const commit = async () => {
      try {
        await Promise.all(ids.map(id => deleteDoc(doc(db, 'samples', id))));
      } catch {
        // Restore if delete fails
        setPendingDeleteIds(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; });
        showToast('Failed to delete samples.', 'error');
      } finally {
        setPendingDeleteIds(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; });
        ids.forEach(id => pendingDeleteTimers.current.delete(id));
      }
    };

    const undo = () => {
      ids.forEach(id => {
        const t = pendingDeleteTimers.current.get(id);
        if (t) { clearTimeout(t); pendingDeleteTimers.current.delete(id); }
      });
      setPendingDeleteIds(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; });
    };

    const timer = setTimeout(commit, 5000);
    ids.forEach(id => pendingDeleteTimers.current.set(id, timer));

    showToast(`${ids.length} sample(s) deleted`, 'undo', undo);
  };

  const handleCreateLab = async () => {
    const name = window.prompt('Enter a name for your new Lab Group:');
    if (name && name.trim() && user) {
      setIsActionLoading(true);
      try {
        await createLab(name.trim(), user.uid);
        refreshLabs();
        showToast('Lab Group created successfully!', 'success');
      } catch {
        showToast('Failed to create lab group.', 'error');
      } finally {
        setIsActionLoading(false);
      }
    }
  };

  const handleJoinLab = async () => {
    const code = window.prompt('Enter the 6-character lab join code:');
    if (code && code.trim() && user) {
      setIsActionLoading(true);
      try {
        await joinLab(code.trim(), user.uid);
        refreshLabs();
        showToast('Successfully joined lab!', 'success');
      } catch (err: any) {
        showToast(err.message || 'Failed to join lab group.', 'error');
      } finally {
        setIsActionLoading(false);
      }
    }
  };

  const handleDeleteLab = async (lab: { id: string; name: string; creatorId: string; joinCode: string; members: string[] }) => {
    if (!window.confirm(`Permanently delete group "${lab.name}"? Data will be unshared but not deleted.`)) return;
    try {
      await deleteLab(lab.id);
      refreshLabs();
      if (selectedLabId === lab.id) setSelectedLabId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLoadDemo = async () => {
    if (!user) return;
    if (!window.confirm('Load demo data? This will add ~38 sample records and 3 protocols to your account. You can clear them at any time.')) return;
    setIsDemoLoading(true);
    try {
      await seedDemoData(user.uid);
      setToast({ message: 'Demo data loaded — explore the analytical tools to see it in action', type: 'success' });
    } catch (e) {
      console.error(e);
      setToast({ message: 'Failed to load demo data', type: 'error' });
    } finally {
      setIsDemoLoading(false);
    }
  };

  const handleClearDemo = async () => {
    if (!user) return;
    if (!window.confirm('Remove all demo data from your account?')) return;
    setIsDemoLoading(true);
    try {
      const { samples: n } = await clearDemoData(user.uid);
      setToast({ message: `Cleared ${n} demo samples`, type: 'success' });
    } catch (e) {
      console.error(e);
      setToast({ message: 'Failed to clear demo data', type: 'error' });
    } finally {
      setIsDemoLoading(false);
    }
  };

  // --- Render guards ---
  if (loading) return <DashboardSkeleton />;
  if (error) return <div className="text-center p-8 text-red-600">Error: {error}</div>;
  if (samples.length === 0) return <EmptyState onLoadDemo={handleLoadDemo} isDemoLoading={isDemoLoading} />;

  if (modals.activeModal === 'replicates')
    return (
      <ErrorBoundary>
        <ReplicateManager samples={hubSamples} onClose={modals.closeAll} />
      </ErrorBoundary>
    );

  if (modals.activeModal === 'matchingQC')
    return (
      <ErrorBoundary>
        <QCMatcher
          samples={hubSamples}
          initialSelectedIds={selectedSampleIds}
          onClose={modals.closeAll}
          onViewQC={(s, f) => modals.openQCPair({ spectro: s, fluor: f })}
        />
      </ErrorBoundary>
    );

  if (modals.activeQCPair)
    return (
      <ErrorBoundary>
        <QCView
          spectro={modals.activeQCPair.spectro}
          fluor={modals.activeQCPair.fluor}
          onBack={() => modals.openQCPair(null as any)}
        />
      </ErrorBoundary>
    );

  if (modals.activeModal === 'analyzing') {
    const selectedSamples = samples.filter(s => selectedSampleIds.includes(s.id!));
    return (
      <div className="space-y-6">
        <button
          onClick={modals.closeAll}
          className="text-blue-600 font-medium hover:text-blue-800 transition-colors flex items-center gap-2"
        >
          ← Back to Sample Browser
        </button>
        <ErrorBoundary>
          <SpectralPlot samples={selectedSamples} />
        </ErrorBoundary>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className={modals.activeModal === 'qr' ? 'print:hidden' : ''}>
        <div className="px-1 print:hidden">
          <h1 className="text-2xl font-bold" style={{ color: BRAND_COLOR }}>
            {activeHub === 'quant' ? 'Quantification Hub' : 'Cell Counting Hub'}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {activeHub === 'quant'
              ? 'Manage and analyze your DeNovix UV-Vis and Fluorescence data'
              : 'Manage and analyze your DeNovix CellDrop data'}
          </p>
        </div>

        {hasMore && (
          <div className="mx-1 mt-3 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 flex items-center gap-2 print:hidden">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Showing the {rawSamples.length} most recent samples. Use "Load more" at the bottom to access older data.
          </div>
        )}

        {hasDemoData && (
          <div className="mx-1 mt-3 px-4 py-2.5 bg-violet-50 border border-violet-200 rounded-lg flex items-center justify-between print:hidden">
            <div className="flex items-center gap-2 text-sm text-violet-800 font-medium">
              <PlayCircle className="h-4 w-4 text-violet-500 shrink-0" />
              Demo mode — {demoSampleCount} sample records loaded across 3 protocols. Explore the Analytical Workflows above to see all features.
            </div>
            <button
              onClick={handleClearDemo}
              disabled={isDemoLoading}
              className="ml-4 text-xs font-bold text-violet-600 hover:text-violet-900 border border-violet-300 px-3 py-1 rounded-md hover:bg-violet-100 transition-colors disabled:opacity-50 shrink-0"
            >
              {isDemoLoading ? 'Clearing…' : 'Clear Demo Data'}
            </button>
          </div>
        )}

        {/* Hub Switcher */}
        <div className="flex items-center gap-4 mb-6 print:hidden">
          <div className="flex p-1 bg-slate-100 rounded-xl shadow-inner border border-slate-200/50">
            <button
              onClick={() => setActiveHub('quant')}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeHub === 'quant' ? 'bg-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              style={activeHub === 'quant' ? { color: BRAND_COLOR } : {}}
            >
              Quantification Hub
            </button>
            <button
              onClick={() => setActiveHub('cell')}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeHub === 'cell' ? 'bg-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              style={activeHub === 'cell' ? { color: BRAND_COLOR } : {}}
            >
              Cell Counting Hub
            </button>
          </div>
        </div>

        {/* Analytical Workflows */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6 print:hidden">
          <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-100 flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Analytical Workflows</span>
            <div className="w-px h-3.5 bg-slate-200 mx-1" />
            <span className="text-[10px] text-slate-400 font-medium">
              {activeHub === 'quant' ? 'Quantification Hub' : 'Cell Counting Hub'}
            </span>
          </div>
          <div className="p-3 flex flex-wrap gap-2">
            <button
              onClick={modals.openReplicates}
              className="px-4 py-1.5 border rounded-lg text-sm hover:bg-white transition-all shadow-sm flex items-center gap-2 font-bold"
              style={{ color: BRAND_COLOR, borderColor: `${BRAND_COLOR}44`, backgroundColor: `${BRAND_COLOR}08` }}
            >
              <Layers className="h-4 w-4" /> Identify Replicates
            </button>
            {activeHub === 'quant' && (
              <button
                onClick={modals.openMatchingQC}
                className="px-4 py-1.5 border rounded-lg text-sm hover:bg-white transition-all shadow-sm flex items-center gap-2 font-bold"
                style={{ color: BRAND_COLOR, borderColor: `${BRAND_COLOR}44`, backgroundColor: `${BRAND_COLOR}08` }}
              >
                <Beaker className="h-4 w-4" /> SmartQC
              </button>
            )}
            <button
              onClick={modals.openTrend}
              className="px-4 py-1.5 border rounded-lg text-sm hover:bg-white transition-all shadow-sm flex items-center gap-2 font-bold"
              style={{ color: BRAND_COLOR, borderColor: `${BRAND_COLOR}44`, backgroundColor: `${BRAND_COLOR}08` }}
            >
              <TrendingUp className="h-4 w-4" /> Trend & Drift
            </button>
            <button
              onClick={modals.openLeveyJennings}
              className="px-4 py-1.5 border rounded-lg text-sm hover:bg-white transition-all shadow-sm flex items-center gap-2 font-bold"
              style={{ color: BRAND_COLOR, borderColor: `${BRAND_COLOR}44`, backgroundColor: `${BRAND_COLOR}08` }}
            >
              <Activity className="h-4 w-4" /> Run Control Charts
            </button>
            <button
              onClick={modals.openProtocol}
              className="px-4 py-1.5 border rounded-lg text-sm hover:bg-white transition-all shadow-sm flex items-center gap-2 font-bold"
              style={{ color: BRAND_COLOR, borderColor: `${BRAND_COLOR}44`, backgroundColor: `${BRAND_COLOR}08` }}
            >
              <FlaskConical className="h-4 w-4" /> Protocol Templates
            </button>
            <button
              onClick={modals.openBatchReport}
              className="px-4 py-1.5 border rounded-lg text-sm hover:bg-white transition-all shadow-sm flex items-center gap-2 font-bold"
              style={{ color: BRAND_COLOR, borderColor: `${BRAND_COLOR}44`, backgroundColor: `${BRAND_COLOR}08` }}
            >
              <FileText className="h-4 w-4" /> Batch Report
            </button>
            {activeHub === 'quant' && (
              <button
                onClick={modals.openSpectralFingerprint}
                className="px-4 py-1.5 border rounded-lg text-sm hover:bg-white transition-all shadow-sm flex items-center gap-2 font-bold"
                style={{ color: BRAND_COLOR, borderColor: `${BRAND_COLOR}44`, backgroundColor: `${BRAND_COLOR}08` }}
              >
                <Scan className="h-4 w-4" /> Spectral Fingerprinting
              </button>
            )}
            <div className="w-px h-5 bg-slate-200 mx-1 self-center" />
            <button
              onClick={hasDemoData ? handleClearDemo : handleLoadDemo}
              disabled={isDemoLoading}
              className="px-4 py-1.5 border rounded-lg text-sm hover:bg-violet-50 transition-all shadow-sm flex items-center gap-2 font-bold disabled:opacity-50"
              style={{ color: '#7c3aed', borderColor: '#c4b5fd', backgroundColor: hasDemoData ? '#ede9fe' : '#f5f3ff' }}
            >
              <PlayCircle className="h-4 w-4" />
              {isDemoLoading ? 'Working…' : hasDemoData ? 'Clear Demo' : 'Load Demo Data'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:overflow-visible print:border-none print:shadow-none print:bg-transparent">
          {/* Lab View Toggle */}
          <div className="flex border-b border-slate-100 print:hidden">
            <button
              onClick={() => setViewMode('private')}
              className={`flex-1 py-3 text-sm font-bold transition-colors border-b-2 ${viewMode === 'private' ? 'bg-blue-50/30' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              style={viewMode === 'private' ? { borderBottomColor: BRAND_COLOR, color: BRAND_COLOR } : {}}
            >
              {activeHub === 'quant' ? 'Private Quant Data' : 'Private Cell Data'}
            </button>
            <button
              onClick={() => { setViewMode('groups'); setSelectedLabId(null); }}
              className={`flex-1 py-3 text-sm font-bold transition-colors border-b-2 ${viewMode === 'groups' ? 'border-purple-600 text-purple-600 bg-purple-50/30' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
              My Groups ({userLabs.length})
            </button>
          </div>

          {viewMode === 'groups' && !selectedLabId && (
            <div className="p-8 bg-slate-50/50 print:hidden">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-bold" style={{ color: BRAND_COLOR }}>Research Collaborations</h2>
                <div className="flex gap-2">
                  <button
                    onClick={handleJoinLab}
                    disabled={isActionLoading}
                    className="px-4 py-2 border border-purple-200 text-purple-600 font-bold rounded-lg text-sm hover:bg-purple-50 transition-colors disabled:opacity-50"
                  >
                    {isActionLoading ? 'Joining...' : 'Join with Code'}
                  </button>
                  <button
                    onClick={handleCreateLab}
                    disabled={isActionLoading}
                    className="px-4 py-2 bg-purple-600 text-white font-bold rounded-lg text-sm hover:bg-purple-700 shadow-sm transition-colors disabled:opacity-50"
                  >
                    {isActionLoading ? 'Creating...' : '+ New Group'}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {userLabs.map(lab => {
                  const isLabAdmin = lab.creatorId === user?.uid;
                  return (
                    <div key={lab.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-4">
                        <div className="p-2 bg-purple-100 text-purple-700 rounded-lg"><Users className="h-5 w-5" /></div>
                        {isLabAdmin && (
                          <button onClick={() => handleDeleteLab(lab)} className="text-slate-300 hover:text-red-500 transition-colors">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <h3 className="font-bold text-slate-900 mb-1">{lab.name}</h3>
                      <div className="flex items-center gap-2 mb-6">
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Invite Code:</span>
                        <code className="text-xs bg-slate-100 px-2 py-1 rounded font-mono font-bold text-purple-600">{lab.joinCode}</code>
                      </div>
                      <button
                        onClick={() => setSelectedLabId(lab.id)}
                        className="w-full py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 transition-colors"
                      >
                        View Shared Feed
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!(viewMode === 'groups' && !selectedLabId) && (
            <>
              {viewMode === 'groups' && selectedLabId && (
                <div className="px-6 py-4 bg-purple-50 border-b border-purple-100 flex items-center justify-between print:hidden">
                  <button onClick={() => setSelectedLabId(null)} className="text-purple-600 text-sm font-bold flex items-center gap-2 hover:underline">← Back to Groups</button>
                  <h2 className="text-lg font-bold text-slate-800">{userLabs.find(l => l.id === selectedLabId)?.name} Feed</h2>
                  <div className="w-24" />
                </div>
              )}

              {/* Toolbar */}
              <div className="border-b border-slate-100 bg-slate-50/80 print:hidden">
                <div className="p-4">
                  <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                    <div className="flex flex-wrap gap-2 items-center w-full md:w-auto">
                      <div className="relative w-full sm:w-72">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search by sample name..."
                          className="w-full pl-9 pr-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                          value={filters.searchTerm}
                          onChange={e => filters.setSearchTerm(e.target.value)}
                        />
                      </div>
                      <select className="flex-1 sm:flex-none px-3 py-2 border rounded-md text-sm bg-white outline-none" value={filters.filterType} onChange={e => filters.setFilterType(e.target.value)}>
                        <option value="all">All Types</option>
                        <option value="spectro">Spectro</option>
                        <option value="fluor">Fluorescence</option>
                        <option value="cell-count">Cell Count</option>
                        <option value="image">Image</option>
                      </select>
                      <select className="flex-1 sm:flex-none px-3 py-2 border rounded-md text-sm bg-white outline-none" value={filters.filterApp} onChange={e => filters.setFilterApp(e.target.value)}>
                        <option value="all">All Applications</option>
                        {filters.applications.map(app => <option key={app} value={app}>{app}</option>)}
                      </select>
                      <div className="flex items-center gap-1 w-full sm:w-auto">
                        <select
                          className="flex-1 sm:flex-none px-3 py-2 border rounded-md text-sm bg-white outline-none font-medium"
                          style={{ color: BRAND_COLOR }}
                          value={filters.filterProjectId}
                          onChange={filters.handleProjectFilterChange}
                        >
                          <option value="all">Global (All Projects)</option>
                          <option value="">Unassigned Samples</option>
                          <option value="CREATE_NEW" className="font-bold">+ Create New Project</option>
                          {projects.map(p => <option key={p.id} value={p.id}>📁 {p.name}</option>)}
                        </select>
                        {filters.filterProjectId !== 'all' && filters.filterProjectId !== '' && (
                          <button onClick={() => filters.handleDeleteProject(projects)} className="p-2 text-slate-400 hover:text-red-600 transition-colors" title="Delete Project">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <button onClick={() => window.print()} className="p-2 border rounded-md bg-white hover:bg-slate-50 text-slate-400" title="Print PDF">
                        <Printer className="h-4 w-4" />
                      </button>
                      <button
                        title="Export current view as CSV"
                        onClick={() => {
                          const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]));
                          exportSamplesToCSV(
                            filters.sortedSamples,
                            projectMap,
                            `samples-${new Date().toISOString().slice(0, 10)}.csv`
                          );
                        }}
                        className="p-2 border rounded-md bg-white hover:bg-slate-50 text-slate-400 transition-colors"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        title={`Row density: ${density}`}
                        onClick={() => {
                          const next = density === 'compact' ? 'comfortable' : density === 'comfortable' ? 'spacious' : 'compact';
                          setDensity(next);
                          localStorage.setItem('dv_density', next);
                        }}
                        className="p-2 border rounded-md bg-white hover:bg-slate-50 text-slate-400 transition-colors"
                      >
                        <AlignJustify className={`h-4 w-4 ${density === 'compact' ? 'scale-75' : density === 'spacious' ? 'scale-110' : ''} transition-transform`} />
                      </button>
                      <button
                        onClick={modals.openAdmin}
                        className={`p-2 border rounded-md bg-white hover:bg-slate-50 transition-colors flex items-center gap-1.5 text-sm font-medium ${activeQCProfile ? 'text-blue-600 border-blue-200' : 'text-slate-400'}`}
                        title="QC Settings"
                      >
                        <Settings className="h-4 w-4" />
                        {activeQCProfile && <ShieldCheck className="h-3.5 w-3.5" />}
                      </button>
                    </div>

                    {selectedSampleIds.length > 0 && (
                      <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end">
                        {/* Bulk project assignment */}
                        <select
                          className="px-3 py-2 border rounded-md text-sm bg-white outline-none font-medium text-slate-600 disabled:opacity-50"
                          disabled={isActionLoading}
                          value=""
                          onChange={e => {
                            const val = e.target.value;
                            if (val !== '') handleBulkAssignProject(val === '__none__' ? null : val);
                          }}
                        >
                          <option value="" disabled>Assign to project…</option>
                          <option value="__none__">Remove from project</option>
                          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        {userLabs.length > 0 && viewMode === 'private' && (
                          userLabs.length === 1 ? (
                            <button
                              onClick={() => handleShareWithLab(userLabs[0].id)}
                              disabled={isActionLoading}
                              className="px-4 py-2 bg-purple-50 text-purple-600 border border-purple-200 text-sm font-medium rounded-md hover:bg-purple-100 transition-colors flex items-center gap-2 disabled:opacity-50"
                            >
                              <Share2 className="h-4 w-4" /> Share with Lab
                            </button>
                          ) : (
                            <select
                              disabled={isActionLoading}
                              className="px-3 py-2 bg-purple-50 text-purple-600 border border-purple-200 text-sm font-medium rounded-md hover:bg-purple-100 transition-colors outline-none cursor-pointer disabled:opacity-50"
                              onChange={e => e.target.value && handleShareWithLab(e.target.value)}
                              value=""
                            >
                              <option value="" disabled>Share with...</option>
                              {userLabs.map(lab => <option key={lab.id} value={lab.id}>Share with {lab.name}</option>)}
                            </select>
                          )
                        )}
                        <button
                          onClick={handleDeleteSelected}
                          className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 text-sm font-medium rounded-md hover:bg-red-100 transition-colors flex items-center gap-2"
                        >
                          <Trash2 className="h-4 w-4" /> Delete ({selectedSampleIds.length})
                        </button>
                        <button
                          onClick={modals.openQR}
                          className="px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-md hover:bg-slate-700 transition-colors flex items-center gap-2 shadow-sm"
                        >
                          <Smartphone className="h-4 w-4" /> Export
                        </button>
                        {activeHub === 'quant' ? (
                          <button
                            onClick={modals.openAnalyzing}
                            className="px-4 py-2 text-white text-sm font-medium rounded-md hover:opacity-90 transition-colors shadow-sm flex items-center gap-2"
                            style={{ backgroundColor: BRAND_COLOR }}
                          >
                            <Layers className="h-4 w-4" /> Overlay Spectra ({selectedSampleIds.length})
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              const selected = samples.filter(s => selectedSampleIds.includes(s.id!));
                              if (selected.length === 1) {
                                modals.openViewer(selected[0].id!);
                              } else {
                                modals.openComparing(selected);
                              }
                            }}
                            className="px-4 py-2 text-white text-sm font-medium rounded-md hover:opacity-90 transition-colors shadow-sm"
                            style={{ backgroundColor: BRAND_COLOR }}
                          >
                            {selectedSampleIds.length === 1 ? 'Analyze Count' : 'Compare Results'} ({selectedSampleIds.length})
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                </div>
              </div>

              {filters.filterGroupId && (
                <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex justify-between items-center text-sm font-medium print:hidden" style={{ color: BRAND_COLOR }}>
                  <div className="flex items-center gap-2">
                    <div className="p-1 bg-blue-100 rounded"><Layers className="h-3.5 w-3.5" /></div>
                    <span>Viewing Replicate Group</span>
                  </div>
                  <div className="flex gap-4 items-center">
                    <button
                      onClick={() => {
                        const groupIds = samples.filter(s => s.replicateGroupId === filters.filterGroupId).map(s => s.id!);
                        setSelectedSampleIds(prev => Array.from(new Set([...prev, ...groupIds])));
                      }}
                      className="hover:underline text-blue-800"
                    >
                      Select All in Group
                    </button>
                    <button onClick={() => filters.setFilterGroupId(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto print:overflow-visible">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider border-b">
                      <th className={`${tdPad} w-10`}>
                        <input
                          type="checkbox"
                          checked={selectedSampleIds.length === filters.filteredSamples.length && filters.filteredSamples.length > 0}
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <ThSortable label="Sample Name" field="sampleName" sortConfig={filters.sortConfig} onSort={filters.handleSort} pad={tdPad} />
                      {activeHub === 'quant' ? (
                        <>
                          <ThSortable label="Application" field="application" sortConfig={filters.sortConfig} onSort={filters.handleSort} pad={tdPad} />
                          <ThSortable label="Conc." field="concentration" sortConfig={filters.sortConfig} onSort={filters.handleSort} pad={tdPad} />
                          <ThSortable label="260/280" field="ratios" sortConfig={filters.sortConfig} onSort={filters.handleSort} pad={tdPad} />
                          <th className={tdPad}>260/230</th>
                          <th className={`${tdPad} text-center`}>Quality</th>
                        </>
                      ) : (
                        <>
                          <th className={tdPad}>Protocol</th>
                          <th className={tdPad}>Total Count</th>
                          <th className={tdPad}>% Viability</th>
                          <th className={`${tdPad} text-center`}>Mean Diameter</th>
                        </>
                      )}
                      <ThSortable label="Measured" field="measuredAt" sortConfig={filters.sortConfig} onSort={filters.handleSort} pad={tdPad} />
                      <th className={`${tdPad} print:hidden`} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filters.sortedSamples.map((sample, rowIdx) => {
                      const isSelected = selectedSampleIds.includes(sample.id!);
                      const isExpanded = expandedRow === sample.id;
                      const date = convertFirestoreTimestampToDate(sample.measuredAt);
                      const evenRow = rowIdx % 2 === 1;
                      return (
                        <React.Fragment key={sample.id}>
                          <tr className={`hover:bg-slate-50 transition-colors ${isSelected ? 'bg-blue-50/30' : evenRow ? 'bg-slate-50/30' : ''} ${sample.sampleType === 'fluor' ? 'border-l-4 border-l-purple-400' : ''}`}>
                            <td className={tdPad}>
                              <input type="checkbox" checked={isSelected} onChange={() => handleSelectSample(sample.id!)} />
                            </td>
                            <td className={tdPad}>
                              {editingId === sample.id ? (
                                <input
                                  autoFocus
                                  className="border rounded px-2 py-1 outline-none focus:ring-2"
                                  style={{ '--tw-ring-color': BRAND_COLOR } as any}
                                  defaultValue={sample.sampleName}
                                  onBlur={e => handleRename(sample.id!, e.target.value)}
                                  onKeyDown={e => e.key === 'Enter' && handleRename(sample.id!, e.currentTarget.value)}
                                />
                              ) : (
                                <div className="flex items-center flex-wrap gap-2 group">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-slate-900">{sample.sampleName || 'Unnamed'}</span>
                                    {(sample.data?.wavelengths?.length ?? 0) > 0 && (
                                      <Sparkline wavelengths={sample.data!.wavelengths} absorbance={sample.data!.absorbance} />
                                    )}
                                    <button onClick={() => setEditingId(sample.id!)} className="opacity-0 group-hover:opacity-100 text-slate-400 transition-opacity hover:text-blue-600 print:hidden">
                                      <Edit2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                  {sample.replicateGroupId && (
                                    <button
                                      onClick={e => { e.stopPropagation(); filters.setFilterGroupId(sample.replicateGroupId!); }}
                                      className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full flex items-center gap-1 print:border print:border-blue-200"
                                      title="View Replicate Group"
                                    >
                                      <Layers className="h-3 w-3" /> Group
                                    </button>
                                  )}
                                  {sample.sharedWithLabId && (
                                    <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold rounded-full flex items-center gap-1">
                                      <Users className="h-2.5 w-2.5" /> Shared
                                    </span>
                                  )}
                                  {sample.projectId && (
                                    <span className="px-2 py-0.5 border border-slate-200 text-slate-500 text-[10px] font-bold rounded-full flex items-center gap-1">
                                      <Folder className="h-2.5 w-2.5" /> {projects.find(p => p.id === sample.projectId)?.name || 'Project'}
                                    </span>
                                  )}
                                  {sample.pairedId && (
                                    <button
                                      onClick={e => {
                                        e.stopPropagation();
                                        const partner = samples.find(s => s.pairedId === sample.pairedId && s.id !== sample.id);
                                        if (partner) {
                                          const spectro = sample.sampleType === 'spectro' ? sample : partner;
                                          const fluor = sample.sampleType === 'fluor' ? sample : partner;
                                          modals.openQCPair({ spectro, fluor });
                                        }
                                      }}
                                      className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full flex items-center gap-1"
                                    >
                                      <Beaker className="h-3 w-3" /> {sample.pairName || 'Matched'}
                                      {sample.qcMatchScore != null && (
                                        <span className="ml-1 text-emerald-800">{sample.qcMatchScore.toFixed(1)}%</span>
                                      )}
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                            {activeHub === 'quant' ? (
                              <>
                                <td className={tdPad}>
                                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider">{sample.application}</span>
                                </td>
                                <td className={`${tdPad} text-slate-600 font-mono`}>
                                  {sample.concentration?.toFixed(2)} <span className="text-[10px]">{sample.metadata.unit}</span>
                                </td>
                                <td className={`${tdPad} text-slate-600 font-mono`}>
                                  <RatioDisplay value={sample.ratios?.['260/280']} alert={sample.metadata['260/280 Alert'] || sample.metadata['260/280 alert']} />
                                </td>
                                <td className={`${tdPad} text-slate-600 font-mono`}>
                                  <RatioDisplay value={sample.ratios?.['260/230']} alert={sample.metadata['260/230 Alert'] || sample.metadata['260/230 alert']} />
                                </td>
                                <td className={`${tdPad} text-center`}>
                                  {(() => {
                                    const violations = sampleViolations.get(sample.id!) ?? [];
                                    const hasInstrumentAlert = sample.alerts && sample.alerts.length > 0;
                                    if (!violations.length && !hasInstrumentAlert) {
                                      return <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />;
                                    }
                                    return (
                                      <div className="flex items-center justify-center gap-1">
                                        {violations.length > 0 && (
                                          <div title={violations.map(v => v.message).join('\n')}>
                                            <AlertTriangle className="h-5 w-5 text-red-500" />
                                          </div>
                                        )}
                                        {hasInstrumentAlert && (
                                          <div title={sample.alerts!.join(', ')}>
                                            <AlertCircle className="h-5 w-5 text-amber-500" />
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </td>
                              </>
                            ) : (
                              <>
                                <td className={tdPad}>
                                  <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[10px] font-bold truncate max-w-[120px]">
                                    {String(getFuzzy(sample.metadata, 'Protocol') || 'Default')}
                                  </span>
                                </td>
                                <td className={`${tdPad} text-slate-600 font-mono font-bold`}>
                                  {(() => {
                                    const val = sample.metadata?.cellCountData?.totalCells || getFuzzy(sample.metadata, 'TotalCells/mL') || getFuzzy(sample.metadata, 'TotalCellCount');
                                    const num = Number(val);
                                    return isNaN(num) || val === undefined || val === null || val === '' ? '—' : num.toLocaleString();
                                  })()}
                                </td>
                                <td className={tdPad}>
                                  {(() => {
                                    const val = sample.metadata?.cellCountData?.viability || getFuzzy(sample.metadata, 'Viability');
                                    const v = typeof val === 'number' ? val : parseFloat(String(val || ''));
                                    return isNaN(v) || val === undefined || val === null
                                      ? '—'
                                      : <span className="font-mono text-emerald-600 font-bold">{v.toFixed(1)}%</span>;
                                  })()}
                                </td>
                                <td className={`${tdPad} text-center text-slate-600 font-mono`}>
                                  {String(getFuzzy(sample.metadata, 'MeanDiameter') || '—')} <span className="text-xs text-slate-400">µm</span>
                                </td>
                              </>
                            )}
                            <td className={`${tdPad} text-slate-500`}>
                              {date?.toLocaleDateString()}{' '}
                              <span className="text-[10px]">{date?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </td>
                            <td className={`${tdPad} text-right print:hidden`}>
                              <button
                                onClick={() => {
                                  if (sample.pairedId) {
                                    const partner = samples.find(s => s.pairedId === sample.pairedId && s.id !== sample.id);
                                    if (partner) {
                                      modals.openQCPair({
                                        spectro: sample.sampleType === 'spectro' ? sample : partner,
                                        fluor: sample.sampleType === 'fluor' ? sample : partner,
                                      });
                                      return;
                                    }
                                  }
                                  setExpandedRow(isExpanded ? null : sample.id!);
                                }}
                                className="text-slate-400 hover:text-slate-600"
                              >
                                {sample.pairedId ? (
                                  <Beaker className="h-5 w-5 text-emerald-600" />
                                ) : isExpanded ? (
                                  <ChevronDown className="h-5 w-5" />
                                ) : (
                                  <ChevronRight className="h-5 w-5" />
                                )}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-slate-50/30 print:hidden">
                              <td colSpan={9} className="px-6 py-4 border-t border-slate-100">
                                <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs text-slate-600">
                                  {sample.metadata?.operator && (
                                    <div><span className="text-slate-400 font-semibold">Operator:</span> {String(sample.metadata.operator)}</div>
                                  )}
                                  <div>
                                    <span className="text-slate-400 font-semibold">Uploaded:</span>{' '}
                                    {convertFirestoreTimestampToDate(sample.createdAt)?.toLocaleString() ?? '—'}
                                  </div>
                                  {sample.lastModifiedBy && (
                                    <div className="flex items-center gap-1">
                                      <Clock className="h-3 w-3 text-slate-400" />
                                      <span className="text-slate-400 font-semibold">Last edited by</span>{' '}
                                      {sample.lastModifiedBy}{' '}
                                      {sample.lastModifiedAt && (
                                        <span className="text-slate-400">at {convertFirestoreTimestampToDate(sample.lastModifiedAt)?.toLocaleString()}</span>
                                      )}
                                    </div>
                                  )}
                                  {sample.dilutionFactor && sample.dilutionFactor !== 1 && (
                                    <div><span className="text-slate-400 font-semibold">Dilution:</span> {sample.dilutionFactor}×</div>
                                  )}
                                  <button
                                    onClick={() => modals.openViewer(sample.id!)}
                                    className="ml-auto text-blue-600 font-semibold hover:underline"
                                  >
                                    View full details →
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Load more / pagination footer */}
              {hasMore && (
                <div className="py-4 border-t border-slate-100 flex justify-center print:hidden">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="flex items-center gap-2 px-6 py-2.5 border rounded-lg text-sm font-bold text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {loadingMore ? (
                      <>Loading…</>
                    ) : (
                      <><ChevronsDown className="h-4 w-4" /> Load next {PAGE_SIZE} samples</>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {viewingSample && <SampleViewer sample={viewingSample} onClose={modals.closeAll} />}
      {modals.comparingSamples && <CellCountComparison samples={modals.comparingSamples} onClose={modals.closeAll} />}

      {modals.activeModal === 'qr' && (
        <QRReportModal
          samples={samples.filter(s => selectedSampleIds.includes(s.id!))}
          onClose={modals.closeAll}
          onBaseUrlChange={setQrBaseUrl}
          baseUrlOverride={qrBaseUrl}
        />
      )}

      {modals.activeModal === 'admin' && user && (
        <AdminPanel
          userId={user.uid}
          personalProfile={personalQCProfile}
          onPersonalSave={savePersonalQCProfile}
          userLabs={userLabs}
          refreshLabs={refreshLabs}
          samples={samples}
          onClose={modals.closeAll}
        />
      )}

      {modals.activeModal === 'trend' && (
        <TrendChart samples={hubRawSamples} onClose={modals.closeAll} />
      )}

      {modals.activeModal === 'leveyJennings' && (
        <LeveyJenningsChart samples={hubRawSamples} onClose={modals.closeAll} />
      )}

      {modals.activeModal === 'protocol' && user && (
        <ProtocolManager userId={user.uid} protocols={protocols} onClose={modals.closeAll} />
      )}

      {modals.activeModal === 'batchReport' && (
        <BatchReportModal samples={hubRawSamples} protocols={protocols} onClose={modals.closeAll} />
      )}

      {modals.activeModal === 'spectralFingerprint' && user && (
        <SpectralFingerprintPanel
          userId={user.uid}
          samples={hubRawSamples}
          referenceSpectra={referenceSpectra}
          onClose={modals.closeAll}
        />
      )}

      {toast && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-white font-bold shadow-2xl z-[100] flex items-center gap-3 transition-all ${toast.type === 'success' ? 'bg-emerald-500' : toast.type === 'undo' ? 'bg-slate-800' : 'bg-red-500'}`}>
          {toast.type === 'undo' && <RotateCcw className="h-4 w-4 shrink-0" />}
          <span>{toast.message}</span>
          {toast.onUndo && (
            <button
              onClick={() => { toast.onUndo!(); setToast(null); }}
              className="underline font-black hover:no-underline"
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
};
