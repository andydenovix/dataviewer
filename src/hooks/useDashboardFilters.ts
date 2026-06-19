"use client";

import { useState, useMemo, useCallback, useEffect } from 'react';
import { LabSample } from '@/types';
import { convertFirestoreTimestampToDate } from '@/lib/utils';
import { createProject, deleteProject, Project } from '@/lib/projectService';

function lsGet<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try { const v = localStorage.getItem(key); return v != null ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function lsSet(key: string, v: any) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
}
function ssGet(key: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return sessionStorage.getItem(key) ?? fallback;
}

interface UseDashboardFiltersProps {
  samples: LabSample[];
  activeHub: 'quant' | 'cell';
  userId: string | undefined;
  refreshProjects: () => void;
}

export interface DashboardFilters {
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  filterGroupId: string | null;
  setFilterGroupId: (v: string | null) => void;
  filterType: string;
  setFilterType: (v: string) => void;
  filterApp: string;
  setFilterApp: (v: string) => void;
  filterProjectId: string;
  setFilterProjectId: (v: string) => void;
  sortConfig: { key: keyof LabSample | 'measuredAt'; direction: 'asc' | 'desc' };
  applications: string[];
  filteredSamples: LabSample[];
  sortedSamples: LabSample[];
  handleSort: (key: keyof LabSample | 'measuredAt') => void;
  handleProjectFilterChange: (e: React.ChangeEvent<HTMLSelectElement>) => Promise<void>;
  handleDeleteProject: (projects: Project[]) => Promise<void>;
}

export function useDashboardFilters({
  samples,
  activeHub,
  userId,
  refreshProjects,
}: UseDashboardFiltersProps): DashboardFilters {
  const [searchTerm, setSearchTermRaw] = useState(() => ssGet('dv_search', ''));
  const [filterGroupId, setFilterGroupId] = useState<string | null>(null);
  const [filterType, setFilterTypeRaw] = useState(() => lsGet('dv_filter_type', 'all'));
  const [filterApp, setFilterAppRaw] = useState(() => lsGet('dv_filter_app', 'all'));
  const [filterProjectId, setFilterProjectId] = useState('all');
  const [sortConfig, setSortConfig] = useState<{
    key: keyof LabSample | 'measuredAt';
    direction: 'asc' | 'desc';
  }>(() => lsGet('dv_sort', { key: 'measuredAt', direction: 'desc' }));

  const setSearchTerm = useCallback((v: string) => {
    setSearchTermRaw(v);
    if (typeof window !== 'undefined') sessionStorage.setItem('dv_search', v);
  }, []);
  const setFilterType = useCallback((v: string) => { setFilterTypeRaw(v); lsSet('dv_filter_type', v); }, []);
  const setFilterApp = useCallback((v: string) => { setFilterAppRaw(v); lsSet('dv_filter_app', v); }, []);

  const applications = useMemo(
    () => Array.from(new Set(samples.map(s => s.application))),
    [samples]
  );

  const filteredSamples = useMemo(() => {
    const hubSamples = samples.filter(s => {
      const app = (s.application || '').toUpperCase();
      const meta = s.metadata || {};
      const metaKeys = Object.keys(meta).map(k => k.toUpperCase());
      const metaValues = Object.values(meta).map(v => String(v).toUpperCase());
      const isCellCount =
        s.sampleType === 'cell-count' ||
        app.includes('CELL') ||
        app.includes('AOPI') ||
        app.includes('COUNT') ||
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

  const sortedSamples = useMemo(
    () =>
      [...filteredSamples].sort((a, b) => {
        if (sortConfig.key === 'measuredAt') {
          const dateA = convertFirestoreTimestampToDate(a.measuredAt)?.getTime() ?? 0;
          const dateB = convertFirestoreTimestampToDate(b.measuredAt)?.getTime() ?? 0;
          return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
        }
        const aVal = a[sortConfig.key as keyof LabSample];
        const bVal = b[sortConfig.key as keyof LabSample];
        if (typeof aVal === 'number' && typeof bVal === 'number')
          return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
        if (sortConfig.key === 'ratios') {
          const aRatio = a.ratios?.['260/280'] ?? a.ratios?.['260/230'] ?? 0;
          const bRatio = b.ratios?.['260/280'] ?? b.ratios?.['260/230'] ?? 0;
          return sortConfig.direction === 'asc' ? aRatio - bRatio : bRatio - aRatio;
        }
        const strA = String(aVal ?? '').toLowerCase();
        const strB = String(bVal ?? '').toLowerCase();
        return sortConfig.direction === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
      }),
    [filteredSamples, sortConfig]
  );

  const handleSort = useCallback((key: keyof LabSample | 'measuredAt') => {
    setSortConfig(prev => {
      const next = { key, direction: (prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc') as 'asc' | 'desc' };
      lsSet('dv_sort', next);
      return next;
    });
  }, []);

  const handleProjectFilterChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value;
      if (val === 'CREATE_NEW') {
        const name = window.prompt('Enter name for the new project:');
        if (name && name.trim() && userId) {
          try {
            const newId = await createProject(name.trim(), userId);
            refreshProjects();
            setFilterProjectId(newId);
          } catch (err) {
            console.error('Failed to create project', err);
          }
        }
      } else {
        setFilterProjectId(val);
      }
    },
    [userId, refreshProjects]
  );

  const handleDeleteProject = useCallback(
    async (projects: Project[]) => {
      if (filterProjectId === 'all' || filterProjectId === '') return;
      const project = projects.find(p => p.id === filterProjectId);
      if (
        !window.confirm(
          `Delete project "${project?.name}"? Samples will not be deleted but will become unassigned.`
        )
      )
        return;
      try {
        await deleteProject(filterProjectId);
        setFilterProjectId('all');
        refreshProjects();
      } catch (err) {
        console.error('Failed to delete project', err);
      }
    },
    [filterProjectId, refreshProjects]
  );

  return {
    searchTerm,
    setSearchTerm,
    filterGroupId,
    setFilterGroupId,
    filterType,
    setFilterType,
    filterApp,
    setFilterApp,
    filterProjectId,
    setFilterProjectId,
    sortConfig,
    applications,
    filteredSamples,
    sortedSamples,
    handleSort,
    handleProjectFilterChange,
    handleDeleteProject,
  };
}
