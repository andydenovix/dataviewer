"use client";

import { useState } from 'react';
import { LabSample } from '@/types';

type QCPair = { spectro: LabSample; fluor: LabSample };

export type ActiveModal =
  | 'none'
  | 'analyzing'
  | 'replicates'
  | 'qr'
  | 'matchingQC'
  | 'admin'
  | 'viewer'
  | 'comparing'
  | 'trend'
  | 'leveyJennings'
  | 'protocol'
  | 'batchReport'
  | 'spectralFingerprint';

export interface DashboardModals {
  activeModal: ActiveModal;
  activeQCPair: QCPair | null;
  viewingSampleId: string | null;
  comparingSamples: LabSample[] | null;

  openAnalyzing: () => void;
  openReplicates: () => void;
  openQR: () => void;
  openMatchingQC: () => void;
  openAdmin: () => void;
  openViewer: (sampleId: string) => void;
  openComparing: (samples: LabSample[]) => void;
  openQCPair: (pair: QCPair) => void;
  openTrend: () => void;
  openLeveyJennings: () => void;
  openProtocol: () => void;
  openBatchReport: () => void;
  openSpectralFingerprint: () => void;

  closeAll: () => void;
}

export function useDashboardModals(): DashboardModals {
  const [activeModal, setActiveModal] = useState<ActiveModal>('none');
  const [activeQCPair, setActiveQCPair] = useState<QCPair | null>(null);
  const [viewingSampleId, setViewingSampleId] = useState<string | null>(null);
  const [comparingSamples, setComparingSamples] = useState<LabSample[] | null>(null);

  const closeAll = () => {
    setActiveModal('none');
    setActiveQCPair(null);
    setViewingSampleId(null);
    setComparingSamples(null);
  };

  return {
    activeModal,
    activeQCPair,
    viewingSampleId,
    comparingSamples,

    openAnalyzing: () => setActiveModal('analyzing'),
    openReplicates: () => setActiveModal('replicates'),
    openQR: () => setActiveModal('qr'),
    openMatchingQC: () => setActiveModal('matchingQC'),
    openAdmin: () => setActiveModal('admin'),
    openViewer: (sampleId) => { setViewingSampleId(sampleId); setActiveModal('viewer'); },
    openComparing: (samples) => { setComparingSamples(samples); setActiveModal('comparing'); },
    openQCPair: (pair) => { setActiveQCPair(pair); setActiveModal('none'); },
    openTrend: () => setActiveModal('trend'),
    openLeveyJennings: () => setActiveModal('leveyJennings'),
    openProtocol: () => setActiveModal('protocol'),
    openBatchReport: () => setActiveModal('batchReport'),
    openSpectralFingerprint: () => setActiveModal('spectralFingerprint'),

    closeAll,
  };
}
