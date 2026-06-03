"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, onSnapshot, orderBy, where, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { LabSample } from '../types';
import { convertFirestoreTimestampToDate } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import { SpectralPlot } from './SpectralPlot';
import { Search, ChevronDown, ChevronRight, Edit2, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown, Trash2, AlertTriangle, Layers, X, Beaker, Printer, Folder, Share2, MessageSquare, Users } from 'lucide-react';
import { ReplicateManager } from './ReplicateManager';
import { getUserProjects, Project, updateSampleProject, deleteProject, createProject } from '../../projectService';
import { getUserLabs, Lab, shareSamplesWithLab, addComment, createLab, joinLab, deleteLab } from './labService';
import { RatioDisplay } from './RatioDisplay';
import { QCMatcher } from './QCMatcher';
import { QCView } from './QCView';
import { SampleViewer } from './SampleViewer';
import { CellCountComparison } from './CellCountComparison';
import { BRAND_COLOR } from '@/lib/constants';

export const SampleDashboard: React.FC = () => {
  const { user } = useAuth();
  const [samples, setSamples] = useState<LabSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLabs, setUserLabs] = useState<Lab[]>([]);
  const [selectedLabId, setSelectedLabId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedSampleIds, setSelectedSampleIds] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isManagingReplicates, setIsManagingReplicates] = useState(false);
  const [isMatchingQC, setIsMatchingQC] = useState(false);
  const [activeQCPair, setActiveQCPair] = useState<{spectro: LabSample, fluor: LabSample} | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [activeHub, setActiveHub] = useState<'quant' | 'cell'>('quant');
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [viewMode, setViewMode] = useState<'private' | 'groups'>('private');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterGroupId, setFilterGroupId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterApp, setFilterApp] = useState<string>('all');
  const [filterProjectId, setFilterProjectId] = useState<string>('all');
  const [sortConfig, setSortConfig] = useState<{
    key: keyof LabSample | 'measuredAt';
    direction: 'asc' | 'desc';
  }>({ key: 'measuredAt', direction: 'desc' });
  const [viewingSampleId, setViewingSampleId] = useState<string | null>(null);
  const [comparingSamples, setComparingSamples] = useState<LabSample[] | null>(null);

  useEffect(() => {
    if (!user) {
      setSamples([]);
      setLoading(false);
      return;
    }

    // Fetch projects
    getUserProjects(user.uid).then(setProjects);
    getUserLabs(user.uid).then(setUserLabs);

    const samplesCollection = collection(db, 'samples');
    
    // Dynamic query based on View Mode
    const q = viewMode === 'groups' && selectedLabId
      ? query(samplesCollection, where('sharedWithLabId', '==', selectedLabId), orderBy('measuredAt', 'desc'))
      : query(samplesCollection, where('userId', '==', user.uid), orderBy('measuredAt', 'desc'));

    // Use real-time listener to see updates immediately
    const unsubscribe = onSnapshot(q, 
      (querySnapshot) => {
        const fetchedSamples: LabSample[] = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            userId: data.userId,
            sampleName: data.sampleName,
            sampleType: data.sampleType,
            application: data.application,
            projectId: data.projectId,
            replicateGroupId: data.replicateGroupId,
            pairedId: data.pairedId,
            pairName: data.pairName,
            qcMatchScore: data.qcMatchScore,
            concentration: data.concentration,
            ratios: data.ratios,
            alerts: data.alerts,
            measuredAt: data.measuredAt,
            createdAt: data.createdAt || new Date(),
            data: data.data || undefined,
            images: data.images || {},
            metadata: data.metadata,
          };
        });
        setSamples(fetchedSamples);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Error fetching samples:', err);
        if (err.message.includes('requires an index')) {
          setError('Database index is building. Please wait a few minutes.');
        } else {
          setError('Failed to fetch samples.');
        }
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, viewMode, selectedLabId]);

  const viewingSample = useMemo(() => 
    viewingSampleId ? samples.find(s => s.id === viewingSampleId) : null
  , [viewingSampleId, samples]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleSelectSample = (sampleId: string) => {
    setSelectedSampleIds(prev =>
      prev.includes(sampleId)
        ? prev.filter(id => id !== sampleId)
        : [...prev, sampleId]
    );
  };

  const handleRename = async (id: string, newName: string) => {
    try {
      await updateDoc(doc(db, 'samples', id), { sampleName: newName });
      setEditingId(null);
    } catch (err) {
      console.error("Rename failed", err);
      alert("Failed to rename sample.");
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
      setToast({ message: `Successfully shared with ${targetLab.name}!`, type: 'success' });
      setSelectedSampleIds([]);
    } catch (err) {
      console.error("Sharing failed", err);
      setToast({ message: "Failed to share data.", type: 'error' });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedSampleIds.length} sample(s)? This action cannot be undone.`)) {
      return;
    }

    try {
      const deletePromises = selectedSampleIds.map(id => deleteDoc(doc(db, 'samples', id)));
      await Promise.all(deletePromises);
      
      if (expandedRow && selectedSampleIds.includes(expandedRow)) {
        setExpandedRow(null);
      }
      setSelectedSampleIds([]);
    } catch (err) {
      console.error("Delete failed", err);
      alert("Failed to delete samples. Please check your permissions.");
    }
  };

  const handleSort = (key: keyof LabSample | 'measuredAt') => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleCreateLab = async () => {
    const name = window.prompt("Enter a name for your new Lab Group:");
    if (name && name.trim() && user) {
      setIsActionLoading(true);
      try {
        await createLab(name.trim(), user.uid);
        const labs = await getUserLabs(user.uid);
        setUserLabs(labs);
        setToast({ message: 'Lab Group created successfully!', type: 'success' });
      } catch (err) {
        console.error("Failed to create lab", err);
        setToast({ message: 'Failed to create lab group.', type: 'error' });
      } finally {
        setIsActionLoading(false);
      }
    }
  };

  const handleJoinLab = async () => {
    const code = window.prompt("Enter the 6-character lab join code:");
    if (code && code.trim() && user) {
      setIsActionLoading(true);
      try {
        await joinLab(code.trim(), user.uid);
        const labs = await getUserLabs(user.uid);
        setUserLabs(labs);
        setToast({ message: 'Successfully joined lab!', type: 'success' });
      } catch (err: any) {
        console.error("Failed to join lab", err);
        setToast({ message: err.message || "Failed to join lab group.", type: 'error' });
      } finally {
        setIsActionLoading(false);
      }
    }
  };

  const handleDeleteLab = async (lab: Lab) => {
    if (!window.confirm(`Permanently delete group "${lab.name}"? Data will be unshared but not deleted.`)) return;
    try {
      await deleteLab(lab.id);
      const updated = await getUserLabs(user!.uid);
      setUserLabs(updated);
      if (selectedLabId === lab.id) {
        setSelectedLabId(null);
      }
    } catch (err) {
      console.error("Delete lab failed", err);
    }
  };

  const handleProjectFilterChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'CREATE_NEW') {
      const name = window.prompt("Enter name for the new project:");
      if (name && name.trim() && user) {
        try {
          const newId = await createProject(name.trim(), user.uid);
          const updated = await getUserProjects(user.uid);
          setProjects(updated);
          // Automatically switch filter to the newly created project
          setFilterProjectId(newId);
        } catch (err) {
          console.error("Failed to create project", err);
        }
      }
    } else {
      setFilterProjectId(val);
    }
  };

  const handleDeleteProject = async () => {
    if (filterProjectId === 'all' || filterProjectId === '') return;
    const project = projects.find(p => p.id === filterProjectId);
    if (!window.confirm(`Are you sure you want to delete project "${project?.name}"? Samples will not be deleted, but they will become unassigned.`)) {
      return;
    }

    try {
      await deleteProject(filterProjectId);
      setFilterProjectId('all');
      getUserProjects(user!.uid).then(setProjects);
    } catch (err) {
      console.error("Project deletion failed", err);
    }
  };

  const handleSingleProjectUpdate = async (sampleId: string, projectId: string | null) => {
    try {
      const sampleRef = doc(db, 'samples', sampleId);
      await updateDoc(sampleRef, { projectId });
    } catch (err) {
      console.error("Failed to update sample project", err);
    }
  };

  // Helper for fuzzy metadata lookups (handles trailing spaces/punctuation/casing)
  const getFuzzy = (meta: any, part: string) => {
    if (!meta) return undefined;
    const partClean = part.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const entry = Object.entries(meta).find(([k]) => 
      k.toUpperCase().replace(/[^A-Z0-9]/g, '').includes(partClean)
    );
    return entry ? entry[1] : undefined;
  };

  const filteredSamples = useMemo(() => {
    // First, filter by the active hub (Quantification vs Cell Counting)
    const hubSamples = samples.filter(s => {
      const app = (s.application || '').toUpperCase();
      const meta = s.metadata || {};
      const metaKeys = Object.keys(meta).map(k => k.toUpperCase());
      const metaValues = Object.values(meta).map(v => String(v).toUpperCase());

      const isCellCount = 
        s.sampleType === 'cell-count' || 
        app.includes('CELL') || app.includes('AOPI') || app.includes('COUNT') ||
        metaKeys.some(k => k.includes('VIABILITY') || k.includes('CELLS/ML') || k.includes('DIAMETER')) ||
        metaValues.some(v => v.includes('AOPI') || v.includes('CELLDROP'));

      return activeHub === 'cell' ? isCellCount : !isCellCount;
    });

    return hubSamples.filter(sample => {
    const matchesSearch = sample.sampleName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || sample.sampleType === filterType;
    const matchesApp = filterApp === 'all' || sample.application === filterApp;
    const matchesGroup = !filterGroupId || sample.replicateGroupId === filterGroupId;
    const matchesProject = filterProjectId === 'all' || (sample.projectId || '') === filterProjectId;
    return matchesSearch && matchesType && matchesApp && matchesGroup && matchesProject;
    });
  }, [samples, activeHub, searchTerm, filterType, filterApp, filterGroupId, filterProjectId]);

  const sortedSamples = useMemo(() => [...filteredSamples].sort((a, b) => {
    let aVal = a[sortConfig.key as keyof LabSample];
    let bVal = b[sortConfig.key as keyof LabSample];

    // Specialized handling for timestamps
    if (sortConfig.key === 'measuredAt') {
      const dateA = convertFirestoreTimestampToDate(a.measuredAt)?.getTime() || 0;
      const dateB = convertFirestoreTimestampToDate(b.measuredAt)?.getTime() || 0;
      return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
    }

    // Handle numeric values (Concentration)
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    }

    // Handle Purity Ratios (Nested sorting)
    if (sortConfig.key === 'ratios') {
      // Default to 260/280 for now if just 'ratios' is the key
      // Prioritize 260/280, then 260/230 if 260/280 is not available
      const aRatio = a.ratios?.['260/280'] || a.ratios?.['260/230'] || 0;
      const bRatio = b.ratios?.['260/280'] || b.ratios?.['260/230'] || 0;
      return sortConfig.direction === 'asc' ? aRatio - bRatio : bRatio - aRatio;
    }

    // Handle string values (Name, Application/Sample Type)
    const strA = String(aVal || '').toLowerCase();
    const strB = String(bVal || '').toLowerCase();
    
    if (sortConfig.direction === 'asc') {
      return strA.localeCompare(strB);
    }
    return strB.localeCompare(strA);
  }), [filteredSamples, sortConfig]);

  const SortIcon = ({ field }: { field: keyof LabSample | 'measuredAt' }) => {
    if (sortConfig.key !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-20" />;
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="h-3 w-3 ml-1 text-blue-600" /> 
      : <ArrowDown className="h-3 w-3 ml-1 text-blue-600" />;
  };

  const ThSortable = ({ label, field, center = false }: { label: string, field: keyof LabSample | 'measuredAt', center?: boolean }) => (
    <th 
      className={`p-4 font-semibold cursor-pointer hover:bg-slate-100 transition-colors ${center ? 'text-center' : ''}`}
      onClick={() => handleSort(field)}
    >
      <div className={`flex items-center ${center ? 'justify-center' : ''}`}>
        {label} <SortIcon field={field} />
      </div>
    </th>
  );

  // Get unique applications for the filter dropdown
  const applications = useMemo(() => Array.from(new Set(samples.map(s => s.application))), [samples]);

  const toggleSelectAll = () => {
    setSelectedSampleIds(selectedSampleIds.length === filteredSamples.length ? [] : filteredSamples.map(s => s.id!));
  };

  if (loading) {
    return <div className="text-center p-8 text-gray-600">Loading samples...</div>;
  }

  if (error) {
    return <div className="text-center p-8 text-red-600">Error: {error}</div>;
  }

  if (samples.length === 0) {
    return <div className="text-center p-8 text-gray-600">No samples uploaded yet.</div>;
  }

  if (isManagingReplicates) {
    return <ReplicateManager samples={samples} onClose={() => setIsManagingReplicates(false)} />;
  }

  if (isMatchingQC) {
    return <QCMatcher samples={samples} initialSelectedIds={selectedSampleIds} onClose={() => setIsMatchingQC(false)} onViewQC={(s, f) => {
      setActiveQCPair({ spectro: s, fluor: f });
      setIsMatchingQC(false);
    }} />;
  }

  if (activeQCPair) {
    return <QCView spectro={activeQCPair.spectro} fluor={activeQCPair.fluor} onBack={() => setActiveQCPair(null)} />;
  }

  if (isAnalyzing) {
    const selectedSamples = samples.filter(s => selectedSampleIds.includes(s.id!));
    return (
      <div className="space-y-6">
        <button 
          onClick={() => setIsAnalyzing(false)}
          className="text-blue-600 font-medium hover:text-blue-800 transition-colors flex items-center gap-2"
        >
          ← Back to Sample Browser
        </button>
        <SpectralPlot samples={selectedSamples} />
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="px-1">
        <h1 className="text-2xl font-bold" style={{ color: BRAND_COLOR }}>
          {activeHub === 'quant' ? 'Quantification Hub' : 'Cell Counting Hub'}
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          {activeHub === 'quant' 
            ? 'Manage and analyze your DeNovix UV-Vis and Fluorescence data' 
            : 'Manage and analyze your DeNovix CellDrop data'}
        </p>
      </div>

      {/* Hub Switcher */}
      <div className="flex items-center gap-4 mb-6 no-print">
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

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Lab View Toggle */}
      <div className="flex border-b border-slate-100">
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

      {/* Groups Management View */}
      {viewMode === 'groups' && !selectedLabId && (
        <div className="p-8 bg-slate-50/50">
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
            {userLabs.map(lab => (
              <div key={lab.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-2 bg-purple-100 text-purple-700 rounded-lg">
                    <Users className="h-5 w-5" />
                  </div>
                  {lab.creatorId === user?.uid && (
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
            ))}
            {userLabs.length === 0 && (
              <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-200 rounded-2xl">
                <p className="text-slate-400 text-sm">You haven't joined any research groups yet.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {!(viewMode === 'groups' && !selectedLabId) && (
      <>
      {/* Lab Context Header */}
      {viewMode === 'groups' && selectedLabId && (
        <div className="px-6 py-4 bg-purple-50 border-b border-purple-100 flex items-center justify-between">
          <button 
            onClick={() => setSelectedLabId(null)}
            className="text-purple-600 text-sm font-bold flex items-center gap-2 hover:underline"
          >
            ← Back to Groups
          </button>
          <h2 className="text-lg font-bold text-slate-800">{userLabs.find(l => l.id === selectedLabId)?.name} Feed</h2>
          <div className="w-24"></div> {/* Spacer */}
        </div>
      )}
      {/* Toolbar & Tools */}
      <div className="border-b border-slate-100 bg-slate-50/80">
        <div className="p-4 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by sample name..."
              className="pl-9 pr-3 py-2 border rounded-md text-sm w-72 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select 
            className="px-3 py-2 border rounded-md text-sm bg-white outline-none"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="spectro">Spectro</option>
            <option value="fluor">Fluorescence</option>
            <option value="cell-count">Cell Count</option>
            <option value="image">Image</option>
          </select>
          <select 
            className="px-3 py-2 border rounded-md text-sm bg-white outline-none"
            value={filterApp}
            onChange={(e) => setFilterApp(e.target.value)}
          >
            <option value="all">All Applications</option>
            {applications.map(app => <option key={app} value={app}>{app}</option>)}
          </select>
          <div className="flex items-center gap-1">
            <select 
              className="px-3 py-2 border rounded-md text-sm bg-white outline-none font-medium"
              style={{ color: BRAND_COLOR }}
              value={filterProjectId}
              onChange={handleProjectFilterChange}
            >
              <option value="all">Global (All Projects)</option>
              <option value="">Unassigned Samples</option>
              <option value="CREATE_NEW" className="font-bold">+ Create New Project</option>
              {projects.map(p => <option key={p.id} value={p.id}>📁 {p.name}</option>)}
            </select>
            {filterProjectId !== 'all' && filterProjectId !== '' && (
              <button 
                onClick={handleDeleteProject}
                className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                title="Delete Project"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
          <button onClick={() => window.print()} className="p-2 border rounded-md bg-white hover:bg-slate-50 text-slate-400" title="Print PDF">
            <Printer className="h-4 w-4" />
          </button>
        </div>

        {selectedSampleIds.length > 0 && (
          <div className="flex gap-2">
            {userLabs.length > 0 && viewMode === 'private' && (
              userLabs.length === 1 ? (
                <button 
                  onClick={() => handleShareWithLab(userLabs[0].id)}
                  disabled={isActionLoading}
                  className="px-4 py-2 bg-purple-50 text-purple-600 border border-purple-200 text-sm font-medium rounded-md hover:bg-purple-100 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <Share2 className="h-4 w-4" />
                  Share with Lab
                </button>
              ) : (
                <select 
                  disabled={isActionLoading}
                  className="px-3 py-2 bg-purple-50 text-purple-600 border border-purple-200 text-sm font-medium rounded-md hover:bg-purple-100 transition-colors outline-none cursor-pointer disabled:opacity-50"
                  onChange={(e) => e.target.value && handleShareWithLab(e.target.value)}
                  value=""
                >
                  <option value="" disabled>Share with...</option>
                  {userLabs.map(lab => (
                    <option key={lab.id} value={lab.id}>Share with {lab.name}</option>
                  ))}
                </select>
              )
            )}
            <button 
              onClick={handleDeleteSelected}
              className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 text-sm font-medium rounded-md hover:bg-red-100 transition-colors flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete ({selectedSampleIds.length})
            </button>
            {activeHub === 'quant' ? (
              <button 
                onClick={() => setIsAnalyzing(true)}
                className="px-4 py-2 text-white text-sm font-medium rounded-md hover:opacity-90 transition-colors shadow-sm flex items-center gap-2"
                style={{ backgroundColor: BRAND_COLOR }}
              >
                <Layers className="h-4 w-4" />
                Overlay Spectra ({selectedSampleIds.length})
              </button>
            ) : (
              <button 
                onClick={() => {
                  const selected = samples.filter(s => selectedSampleIds.includes(s.id!));
                  if (selected.length === 1) {
                    setViewingSampleId(selected[0].id!);
                  } else if (selected.length > 1) {
                    setComparingSamples(selected);
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

        {/* Analytical Workflows Row */}
        <div className="px-4 pb-4 flex gap-3 items-center">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-2">Analytical Workflows</span>
          <button 
            onClick={() => setIsManagingReplicates(true)}
            className="px-4 py-1.5 border rounded-lg text-sm hover:bg-white transition-all shadow-sm flex items-center gap-2 font-bold"
            style={{ 
              color: BRAND_COLOR, 
              borderColor: `${BRAND_COLOR}44`,
              backgroundColor: `${BRAND_COLOR}08`
            }}
          >
            <Layers className="h-4 w-4" />
            Identify Replicates
          </button>
          <button 
            onClick={() => setIsMatchingQC(true)}
            className="px-4 py-1.5 border rounded-lg text-sm hover:bg-white transition-all shadow-sm flex items-center gap-2 font-bold"
            style={{ 
              color: BRAND_COLOR, 
              borderColor: `${BRAND_COLOR}44`,
              backgroundColor: `${BRAND_COLOR}08`
            }}
          >
            <Beaker className="h-4 w-4" />
            Method Pairing
          </button>
        </div>
      </div>

      {/* Replicate Group Filter Banner */}
      {filterGroupId && (
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex justify-between items-center text-sm font-medium" style={{ color: BRAND_COLOR }}>
          <div className="flex items-center gap-2">
            <div className="p-1 bg-blue-100 rounded">
              <Layers className="h-3.5 w-3.5" />
            </div>
            <span>Viewing Replicate Group</span>
          </div>
          <div className="flex gap-4 items-center">
            <button 
              onClick={() => {
                const groupIds = samples.filter(s => s.replicateGroupId === filterGroupId).map(s => s.id!);
                setSelectedSampleIds(prev => Array.from(new Set([...prev, ...groupIds])));
              }}
              className="hover:underline text-blue-800"
            >
              Select All in Group
            </button>
            <button onClick={() => setFilterGroupId(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider border-b">
              <th className="p-4 w-10">
                <input 
                  type="checkbox" 
                  checked={selectedSampleIds.length === filteredSamples.length && filteredSamples.length > 0}
                  onChange={toggleSelectAll}
                />
              </th>
              <ThSortable label="Sample Name" field="sampleName" />
              {activeHub === 'quant' ? (
                <>
                  <ThSortable label="Application" field="application" />
                  <ThSortable label="Conc." field="concentration" />
                  <ThSortable label="260/280" field="ratios" />
                  <th className="p-4">260/230</th>
                  <th className="p-4 text-center">Quality</th>
                </>
              ) : (
                <>
                  <th className="p-4">Protocol</th>
                  <th className="p-4">Total Count</th>
                  <th className="p-4">% Viability</th>
                  <th className="p-4 text-center">Mean Diameter</th>
                </>
              )}
              <ThSortable label="Measured" field="measuredAt" />
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {sortedSamples.map((sample) => {
              const isSelected = selectedSampleIds.includes(sample.id!);
              const isExpanded = expandedRow === sample.id;
              const date = convertFirestoreTimestampToDate(sample.measuredAt);
              return (
                <React.Fragment key={sample.id}>
                <tr className={`hover:bg-slate-50 transition-colors ${isSelected ? 'bg-blue-50/30' : ''} ${sample.sampleType === 'fluor' ? 'border-l-4 border-l-purple-400' : ''}`}>
                  <td className="p-4">
                    <input 
                      type="checkbox" 
                      checked={isSelected}
                      onChange={() => handleSelectSample(sample.id!)}
                    />
                  </td>
                  <td className="p-4">
                    {editingId === sample.id ? (
                      <input 
                        autoFocus
                        className="border rounded px-2 py-1 outline-none focus:ring-2"
                        style={{ '--tw-ring-color': BRAND_COLOR } as any}
                        defaultValue={sample.sampleName}
                        onBlur={(e) => handleRename(sample.id!, e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRename(sample.id!, e.currentTarget.value)}
                      />
                    ) : (
                      <div className="flex items-center flex-wrap gap-2 group">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">{sample.sampleName || 'Unnamed'}</span>
                          <button onClick={() => setEditingId(sample.id!)} className="opacity-0 group-hover:opacity-100 text-slate-400 transition-opacity hover:text-blue-600">
                            <Edit2 className="h-3 w-3" />
                          </button>
                        </div>
                        {sample.replicateGroupId && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setFilterGroupId(sample.replicateGroupId!);
                            }}
                            className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full hover:bg-blue-200 transition-colors flex items-center gap-1"
                            title="View Replicate Group"
                          >
                            <Layers className="h-3 w-3" />
                            Group
                          </button>
                        )}
                        {sample.sharedWithLabId && (
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold rounded-full flex items-center gap-1">
                            <Users className="h-2.5 w-2.5" />
                            Shared
                          </span>
                        )}
                        {sample.projectId && (
                          <span className="px-2 py-0.5 border border-slate-200 text-slate-500 text-[10px] font-bold rounded-full flex items-center gap-1">
                            <Folder className="h-2.5 w-2.5" />
                            {projects.find(p => p.id === sample.projectId)?.name || 'Project'}
                          </span>
                        )}
                        {sample.pairedId && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const partner = samples.find(s => s.pairedId === sample.pairedId && s.id !== sample.id);
                              if (partner) {
                                const spectro = sample.sampleType === 'spectro' ? sample : partner;
                                const fluor = sample.sampleType === 'fluor' ? sample : partner;
                                setActiveQCPair({ spectro, fluor });
                              }
                            }}
                            className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full hover:bg-emerald-200 transition-colors flex items-center gap-1"
                            title={`QC Match Score: ${sample.qcMatchScore !== null && sample.qcMatchScore !== undefined ? sample.qcMatchScore.toFixed(1) + '%' : 'N/A'}`}
                          >
                            <Beaker className="h-3 w-3" />
                            {sample.pairName || 'Matched'}
                            {sample.qcMatchScore !== null && sample.qcMatchScore !== undefined && (
                              <span className="ml-1 text-emerald-800">{sample.qcMatchScore.toFixed(1)}%</span>
                            )}
                          </button>
                        )}
                        {!sample.projectId && (
                          <button 
                            onClick={() => setExpandedRow(sample.id!)}
                            className="px-2 py-0.5 border border-dashed border-slate-200 text-slate-400 text-[10px] font-medium rounded-full hover:border-blue-300 hover:text-blue-500 transition-colors"
                          >
                            + Add Project
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  {activeHub === 'quant' ? (
                    <>
                      <td className="p-4">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider">{sample.application}</span>
                      </td>
                      <td className="p-4 text-slate-600 font-mono">
                        {sample.concentration?.toFixed(2)} <span className="text-[10px]">{sample.metadata.unit}</span>
                      </td>
                      <td className="p-4 text-slate-600 font-mono">
                        <RatioDisplay 
                          value={sample.ratios?.['260/280']} 
                          alert={sample.metadata['260/280 Alert'] || sample.metadata['260/280 alert']} 
                        />
                      </td>
                      <td className="p-4 text-slate-600 font-mono">
                        <RatioDisplay 
                          value={sample.ratios?.['260/230']} 
                          alert={sample.metadata['260/230 Alert'] || sample.metadata['260/230 alert']} 
                        />
                      </td>
                      <td className="p-4 text-center">
                        {sample.alerts && sample.alerts.length > 0 ? (
                          <div className="flex justify-center" title={sample.alerts.join(', ')}>
                            <AlertCircle className="h-5 w-5 text-amber-500" />
                          </div>
                        ) : (
                          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>
                        )}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-4">
                        <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[10px] font-bold truncate max-w-[120px]" title={String(getFuzzy(sample.metadata, 'Protocol') || 'Default')}>
                          {String(getFuzzy(sample.metadata, 'Protocol') || 'Default')}
                        </span>
                      </td>
                      <td className="p-4 text-slate-600 font-mono font-bold">
                        {(() => {
                          const val = sample.metadata?.cellCountData?.totalCells || getFuzzy(sample.metadata, 'TotalCells/mL') || getFuzzy(sample.metadata, 'TotalCellCount');
                          const num = Number(val);
                          return isNaN(num) || val === undefined || val === null || val === '' ? '—' : num.toLocaleString();
                        })()}
                      </td>
                      <td className="p-4">
                        {(() => {
                          const val = sample.metadata?.cellCountData?.viability || getFuzzy(sample.metadata, 'Viability');
                          const v = typeof val === 'number' ? val : parseFloat(String(val || ''));
                          return isNaN(v) || val === undefined || val === null ? '—' : <span className="font-mono text-emerald-600 font-bold">{v.toFixed(1)}%</span>;
                        })()}
                      </td>
                      <td className="p-4 text-center text-slate-600 font-mono">
                        {String(getFuzzy(sample.metadata, 'MeanDiameter') || '—')} <span className="text-xs text-slate-400">µm</span>
                      </td>
                    </>
                  )}
                  <td className="p-4 text-slate-500">
                    {date?.toLocaleDateString()} <span className="text-[10px]">{date?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </td>
                  <td className="p-4 text-right">
                    <button 
                      onClick={() => {
                        if (sample.pairedId) {
                          const partner = samples.find(s => s.pairedId === sample.pairedId && s.id !== sample.id);
                          if (partner) {
                            const spectro = sample.sampleType === 'spectro' ? sample : partner;
                            const fluor = sample.sampleType === 'fluor' ? sample : partner;
                            setActiveQCPair({ spectro, fluor });
                            return;
                          }
                        }
                        setExpandedRow(isExpanded ? null : sample.id!);
                      }}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      {sample.pairedId ? <Beaker className="h-5 w-5 text-emerald-600 hover:scale-110 transition-transform" /> : (isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />)}
                    </button>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="bg-slate-50/50">
                    <td colSpan={8} className="p-6 border-t border-slate-100">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {sample.sampleType === 'cell-count' && (
                          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div>
                              <h4 className="text-xs font-bold text-slate-400 uppercase mb-4 flex items-center gap-2 tracking-tight">
                                <Users className="h-3 w-3" /> Population Summary
                              </h4>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                                  <div className="text-[9px] text-slate-400 font-bold uppercase">Live Cells</div>
                                  <div className="text-sm font-mono font-bold text-emerald-600">
                                    {String(getFuzzy(sample.metadata, 'LiveCells/mL') || getFuzzy(sample.metadata, 'LiveCellCount') || '0')}
                                  </div>
                                </div>
                                <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                                  <div className="text-[9px] text-slate-400 font-bold uppercase">Dead Cells</div>
                                  <div className="text-sm font-mono font-bold text-red-600">
                                    {String(getFuzzy(sample.metadata, 'DeadCells/mL') || getFuzzy(sample.metadata, 'DeadCellCount') || '0')}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-slate-400 uppercase mb-4 tracking-tight">Cluster Analysis</h4>
                              <div className="space-y-1 text-xs">
                                {['Unclustered Cells', 'Cluster (2 Cells)', 'Cluster (3 Cells)', 'Cluster (4 Cells)', 'Cluster (5 Cells)', 'Clusters (6 or more)'].map(key => (
                                  <div key={key} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
                                    <span className="text-slate-500">{key}</span>
                                    <span className="font-bold text-slate-700">{String(getFuzzy(sample.metadata, key.replace(/\s+/g, '')) || '0')}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="col-span-full">
                               {(() => {
                                 const keys = Object.keys(sample.metadata);
                                 const diameterValues = keys
                                   .map(k => {
                                     const match = k.match(/(?:Live|Dead)\s*cells\s*(\d+)\s*um/i);
                                     return match ? parseInt(match[1]) : null;
                                   })
                                   .filter((v): v is number => v !== null);
                                 
                                 if (diameterValues.length === 0) return null;
                                 
                                 const min = Math.min(...diameterValues);
                                 const max = Math.max(...diameterValues);
                                 const range = Array.from({ length: max - min + 1 }, (_, i) => min + i);
                                 
                                 return (
                                   <>
                                     <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Diameter Distribution ({min}-{max} µm)</h4>
                                     <div className="h-24 flex items-end gap-0.5 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                        {range.map((d) => {
                                          // Resilient lookup for individual diameter bins
                                          const liveVal = parseInt(String(getFuzzy(sample.metadata, `Livecells${d}um`) || 0));
                                          const deadVal = parseInt(String(getFuzzy(sample.metadata, `Deadcells${d}um`) || 0));
                                          const maxVal = 200; 
                                          return (
                                            <div key={d} className="flex-1 flex flex-col-reverse h-full" title={`${d}µm: ${liveVal} Live, ${deadVal} Dead`}>
                                              <div className="bg-emerald-400" style={{ height: `${Math.min((liveVal / maxVal) * 100, 100)}%` }} />
                                              <div className="bg-red-400" style={{ height: `${Math.min((deadVal / maxVal) * 100, 100)}%` }} />
                                            </div>
                                          );
                                        })}
                                     </div>
                                     <div className="flex justify-between mt-1 text-[8px] text-slate-400 font-bold">
                                       <span>{min}µm</span>
                                       <span>{Math.floor((min + max) / 2)}µm</span>
                                       <span>{max}µm</span>
                                     </div>
                                   </>
                                 );
                               })()}
                            </div>
                          </div>
                        )}

                        {/* AO/PI Image Gallery */}
                        {sample.sampleType === 'cell-count' && sample.images && Object.keys(sample.images).length > 0 && (
                          <div className="col-span-full border-t border-slate-100 pt-6">
                            <h4 className="text-xs font-bold text-slate-400 uppercase mb-4 tracking-tight flex items-center gap-2">
                              <Users className="h-3 w-3" /> Cell Images
                            </h4>
                            <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
                              {Object.entries(sample.images).map(([tag, url]) => (
                                <div key={tag} className="flex-shrink-0 space-y-2">
                                  <div className="relative w-64 h-48 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 group">
                                    <img 
                                      src={url as string} 
                                      alt={tag} 
                                      className="w-full h-full object-cover cursor-zoom-in group-hover:scale-105 transition-transform duration-500" 
                                      onClick={() => window.open(url as string, '_blank')} 
                                    />
                                    <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold rounded-md uppercase tracking-wider">
                                      {tag}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {sample.sampleType !== 'cell-count' && (
                        <>
                        <div>
                          <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Purity Ratios</h4>
                          <div className="space-y-1">
                            {Object.entries(sample.ratios || {}).map(([label, val]) => (
                              <div key={label} className="flex justify-between text-sm border-b border-slate-100 py-1">
                                <span className="text-slate-500">{label}</span>
                                <span className="font-mono font-medium">{val.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        {/* Protein Specific Metadata Section */}
                        {(sample.metadata['E1%'] || sample.metadata['MW'] || sample.metadata['Ext Coeff']) && (
                          <div>
                            <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Protein Analysis</h4>
                            <div className="space-y-1">
                              {sample.metadata['E1%'] && (
                                <div className="flex justify-between text-sm border-b border-slate-100 py-1">
                                  <span className="text-slate-500">E1%</span>
                                  <span className="font-mono font-medium">{sample.metadata['E1%']}</span>
                                </div>
                              )}
                              {sample.metadata['MW'] && (
                                <div className="flex justify-between text-sm border-b border-slate-100 py-1">
                                  <span className="text-slate-500">Molecular Weight</span>
                                  <span className="font-mono font-medium">{sample.metadata['MW']}</span>
                                </div>
                              )}
                              {sample.metadata['Ext Coeff'] && (
                                <div className="flex justify-between text-sm border-b border-slate-100 py-1">
                                  <span className="text-slate-500">Extinction Coeff.</span>
                                  <span className="font-mono font-medium">{sample.metadata['Ext Coeff']}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Replicate Statistics Section */}
                        {sample.metadata?.replicateStats && (
                          <div>
                            <h4 className="text-xs font-bold text-blue-600 uppercase mb-2 flex items-center gap-1">Precision Stats</h4>
                            <div className="space-y-1">
                              <div className="flex justify-between text-sm border-b border-slate-100 py-1">
                                <span className="text-slate-500">Mean Conc.</span>
                                <span className="font-mono font-medium">{sample.metadata.replicateStats.mean?.toFixed(2)} {sample.metadata?.unit}</span>
                              </div>
                              <div className="flex justify-between text-sm border-b border-slate-100 py-1">
                                <span className="text-slate-500">Std. Deviation</span>
                                <span className="font-mono font-medium">{sample.metadata.replicateStats.sd?.toFixed(3)}</span>
                              </div>
                              <div className="flex justify-between text-sm border-b border-slate-100 py-1">
                                <span className="text-slate-500">Coeff. of Var. (%CV)</span>
                                <span className="font-mono font-medium text-blue-600 font-bold">{sample.metadata.replicateStats.cv?.toFixed(1)}%</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Fluorescence Specific Metadata Section */}
                        {sample.sampleType === 'fluor' && (
                          <div>
                            <h4 className="text-xs font-bold text-purple-600 uppercase mb-2">Fluorescence Result</h4>
                            <div className="space-y-1">
                              <div className="flex justify-between text-sm border-b border-slate-100 py-1">
                                <span className="text-slate-500">Stock Conc.</span>
                                <span className="font-mono font-medium">{sample.stockConcentration} {sample.metadata['Sample Stock Units'] || sample.metadata.unit}</span>
                              </div>
                              <div className="flex justify-between text-sm border-b border-slate-100 py-1">
                                <span className="text-slate-500">Dilution Factor</span>
                                <span className="font-mono font-medium">{sample.dilutionFactor}x</span>
                              </div>
                              <div className="flex justify-between text-sm border-b border-slate-100 py-1">
                                <span className="text-slate-500">RFU</span>
                                <span className="font-mono font-medium">{sample.rfu?.toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                        )}
                        </>
                        )}

                        {/* Project Management */}
                        <div>
                          <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Project Assignment</h4>
                          <select
                            className="w-full px-3 py-2 border rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
                            value={sample.projectId || ''}
                            onChange={(e) => handleSingleProjectUpdate(sample.id!, e.target.value || null)}
                          >
                            <option value="">No Project (Global)</option>
                            {projects.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                          <p className="mt-2 text-[10px] text-slate-400 leading-tight">
                            Assigning a project helps organize related experimental data sets.
                          </p>
                        </div>

                        {/* Method Pairing / QC Validation Section */}
                        {sample.pairedId && (
                          <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 flex flex-col">
                            <h4 className="text-xs font-bold text-emerald-600 uppercase mb-2 flex items-center gap-2">
                              <Beaker className="h-3 w-3" /> Method Validation
                            </h4>
                            <p className="text-[10px] text-slate-500 leading-tight mb-4">
                              This sample is part of a persistent method pair for cross-quantification verification.
                            </p>
                            <button 
                              onClick={() => {
                                const partner = samples.find(s => s.pairedId === sample.pairedId && s.id !== sample.id);
                                if (partner) {
                                  const spectro = sample.sampleType === 'spectro' ? sample : partner;
                                  const fluor = sample.sampleType === 'fluor' ? sample : partner;
                                  setActiveQCPair({ spectro, fluor });
                                }
                              }}
                              className="mt-auto w-full py-2 bg-emerald-600 text-white rounded-lg text-[11px] font-bold hover:bg-emerald-700 transition-colors shadow-sm"
                            >
                              View QC Comparison
                            </button>
                          </div>
                        )}

                        <div className="md:col-span-2 lg:col-span-1">
                          <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Run Metadata</h4>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                            {Object.entries(sample.metadata)
                              .filter(([key]) => ![
                                'E1%', 'MW', 'Ext Coeff', '260/280 Alert', '260/230 Alert', 'unit', 'replicateStats',
                                'Unclustered Cells', 'Cluster (2 Cells)', 'Cluster (3 Cells)', 'Cluster (4 Cells)', 'Cluster (5 Cells)', 'Clusters (6 or more)',
                                'Live Cells/mL', 'Dead Cells/mL', 'Total Cells/mL', '% Viability', 'Live Cell Count', 'Dead Cell Count', 'Total Cell Count'
                              ].includes(key) && !key.includes('cells') && !key.includes(' um'))
                              .map(([key, val]) => (
                                <div key={key} className="flex justify-between border-b border-slate-100 py-1">
                                  <span className="text-slate-500 capitalize">{key.replace(/_/g, ' ')}</span>
                                  <span className="truncate max-w-[150px]" title={String(val)}>{String(val)}</span>
                                </div>
                              ))}
                          </div>
                        </div>

                        {/* Lab Discussion Section */}
                        {sample.sharedWithLabId && (
                          <div className="bg-slate-100/50 p-4 rounded-xl border border-slate-200">
                            <h4 className="text-xs font-bold text-slate-400 uppercase mb-4 flex items-center gap-2">
                              <MessageSquare className="h-3 w-3" /> Lab Discussion
                            </h4>
                            <div className="space-y-4 max-h-48 overflow-y-auto mb-4 text-xs">
                              <p className="italic text-slate-400">Discussion threads for shared data will appear here.</p>
                            </div>
                            <div className="flex gap-2">
                              <input 
                                type="text" 
                                placeholder="Add a comment..."
                                className="flex-1 px-3 py-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                value={commentText}
                                onChange={(e) => setCommentText(e.target.value)}
                              />
                              <button 
                                onClick={() => {
                                  addComment(sample.id!, user!.uid, user?.displayName || user?.email!, commentText);
                                  setCommentText('');
                                }}
                                className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm font-bold"
                              >
                                Post
                              </button>
                            </div>
                          </div>
                        )}
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
      </>
      )}

      {/* Sample Viewer Modal */}
      {viewingSample && (
        <SampleViewer 
          sample={viewingSample} 
          onClose={() => setViewingSampleId(null)} 
        />
      )}

      {/* Cell Count Comparison Modal */}
      {comparingSamples && (
        <CellCountComparison 
          samples={comparingSamples} 
          onClose={() => setComparingSamples(null)} 
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-white font-bold shadow-2xl z-[100] transition-all animate-bounce ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}>
          {toast.message}
        </div>
      )}
    </div>
    </div>
  );
};