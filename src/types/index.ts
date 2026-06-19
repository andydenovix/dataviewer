import { FieldValue } from 'firebase/firestore';

export interface SpectroData {
  wavelengths: number[];
  absorbance: number[];
}

export interface CellCountData {
  totalCells: number;
  liveCells: number;
  deadCells: number;
  viability: number;
  meanDiameter?: number;
}

export interface MetricStats {
  mean: number;
  sd: number;
  cv: number;
}

export interface ReplicateStats {
  mean?: number;
  sd?: number;
  cv?: number;
  totalCellCount?: MetricStats;
  liveCells?: MetricStats;
  deadCells?: MetricStats;
  viability?: MetricStats;
}

export interface ImageMetadata {
  bf?: string;
  red?: string;
  green?: string;
  result?: string;
  resultId?: string;
}

export interface SampleMetadata {
  unit: string;
  replicateStats?: ReplicateStats;
  cellCountData?: CellCountData;
  imageMetadata?: ImageMetadata;
  protocolName?: string;
  operator?: string;
  pathlength?: number;
  [key: string]: any;
}

export type FirestoreTimestamp = Date | { seconds: number; nanoseconds: number } | FieldValue;

export interface ThresholdRange {
  min: number;
  max: number;
  enabled: boolean;
}

export interface ThresholdValue {
  value: number;
  enabled: boolean;
}

export interface QCThresholds {
  ratio260_280: ThresholdRange;
  ratio260_230: ThresholdRange;
  minConcentration: ThresholdValue;
  maxConcentration: ThresholdValue;
  maxMethodDelta: ThresholdValue;
  minViability: ThresholdValue;
  minCellCount: ThresholdValue;
}

export interface QCProfile {
  name: string;
  thresholds: QCThresholds;
}

export interface QCViolation {
  field: string;
  message: string;
  severity: 'warning' | 'fail';
}

export interface ReferenceSpectrum {
  id?: string;
  userId: string;
  sampleId: string;
  sampleName: string;
  application: string;
  wavelengths: number[];
  absorbance: number[];
  addedAt?: FirestoreTimestamp;
}

export interface Protocol {
  id?: string;
  userId: string;
  name: string;
  description: string;
  kitName: string;
  sampleType: string;       // '' = any
  application: string;      // '' = any
  qcPreset: string;         // key in QC_PRESETS or 'None'
  requiredFields: string[];
  operatorNotes: string;
  isDemo?: boolean;
  createdAt?: FirestoreTimestamp;
}

export interface LabSample {
  id?: string;
  userId: string;
  sampleName: string;
  sampleType: 'spectro' | 'fluor' | 'image' | 'cell-count';
  application: string;
  projectId?: string | null;
  replicateGroupId?: string;
  pairedId?: string;
  pairName?: string;
  sharedWithLabId?: string;
  qcMatchScore?: number | null;
  concentration?: number;
  rfu?: number;
  stockConcentration?: number;
  dilutionFactor?: number;
  assay?: string;
  curveType?: string;
  ratios?: Record<string, number>;
  alerts?: string[];
  measuredAt: FirestoreTimestamp;
  createdAt: FirestoreTimestamp;
  lastModifiedBy?: string;
  lastModifiedAt?: FirestoreTimestamp;
  protocolId?: string;
  isDemo?: boolean;
  data?: SpectroData;
  imageUrl?: string;
  images?: Record<string, string>;
  metadata: SampleMetadata;
}
