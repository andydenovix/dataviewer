"use client";

import { useState, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import { collection, query, onSnapshot, orderBy, where, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { LabSample } from '@/types';

export const PAGE_SIZE = 100;
export const SAMPLE_LIMIT = PAGE_SIZE; // retained for existing import compatibility

interface UseSamplesResult {
  samples: LabSample[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  atLimit: boolean;
  hasMore: boolean;
  loadMore: () => void;
}

function mapDoc(id: string, data: any): LabSample {
  return {
    id,
    userId: data.userId,
    sampleName: data.sampleName,
    sampleType: data.sampleType,
    application: data.application,
    projectId: data.projectId,
    replicateGroupId: data.replicateGroupId,
    pairedId: data.pairedId,
    pairName: data.pairName,
    sharedWithLabId: data.sharedWithLabId,
    qcMatchScore: data.qcMatchScore,
    concentration: data.concentration,
    rfu: data.rfu,
    stockConcentration: data.stockConcentration,
    dilutionFactor: data.dilutionFactor,
    curveType: data.curveType,
    ratios: data.ratios,
    alerts: data.alerts,
    measuredAt: data.measuredAt,
    createdAt: data.createdAt || new Date(),
    lastModifiedBy: data.lastModifiedBy,
    lastModifiedAt: data.lastModifiedAt,
    protocolId: data.protocolId,
    isDemo: data.isDemo ?? false,
    data: data.data || undefined,
    images: data.images || {},
    metadata: data.metadata || { unit: '' },
  } as LabSample;
}

export function useSamples(
  user: User | null,
  viewMode: 'private' | 'groups',
  selectedLabId: string | null
): UseSamplesResult {
  const [samples, setSamples] = useState<LabSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentLimit, setCurrentLimit] = useState(PAGE_SIZE);

  // Reset page when query context changes
  useEffect(() => {
    setCurrentLimit(PAGE_SIZE);
  }, [user?.uid, viewMode, selectedLabId]);

  useEffect(() => {
    if (!user) {
      setSamples([]);
      setLoading(false);
      return;
    }

    // Show full skeleton only on initial load, not when expanding limit
    if (currentLimit === PAGE_SIZE) setLoading(true);

    const col = collection(db, 'samples');
    const q =
      viewMode === 'groups' && selectedLabId
        ? query(col, where('sharedWithLabId', '==', selectedLabId), orderBy('measuredAt', 'desc'), limit(currentLimit))
        : query(col, where('userId', '==', user.uid), orderBy('measuredAt', 'desc'), limit(currentLimit));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setSamples(snapshot.docs.map(d => mapDoc(d.id, d.data())));
        setLoading(false);
        setLoadingMore(false);
        setError(null);
      },
      (err) => {
        console.error('Error fetching samples:', err);
        setError(
          err.message.includes('requires an index')
            ? 'Database index is building — please wait a few minutes and refresh.'
            : 'Failed to fetch samples.'
        );
        setLoading(false);
        setLoadingMore(false);
      }
    );

    return () => unsubscribe();
  }, [user, viewMode, selectedLabId, currentLimit]);

  const loadMore = useCallback(() => {
    setLoadingMore(true);
    setCurrentLimit(prev => prev + PAGE_SIZE);
  }, []);

  return {
    samples,
    loading,
    loadingMore,
    error,
    atLimit: samples.length >= currentLimit,
    hasMore: samples.length === currentLimit,
    loadMore,
  };
}
