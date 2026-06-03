import { FieldValue } from 'firebase/firestore';

export interface SpectroData {
  wavelengths: number[];
  absorbance: number[];
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
  ratios?: Record<string, number>; // e.g., {"260/280": 1.85, "260/230": 2.1}
  alerts?: string[]; // e.g., ["Below min concentration"]
  measuredAt: Date | { seconds: number; nanoseconds: number } | FieldValue;
  createdAt: Date | { seconds: number; nanoseconds: number } | FieldValue; 
  data?: SpectroData;
  imageUrl?: string;
  images?: Record<string, string>;
  metadata: Record<string, any> & {
    replicateStats?: {
      mean?: number;
      sd?: number;
      cv?: number;
      totalCellCount?: {
        mean: number;
        sd: number;
        cv: number;
      };
      liveCells?: {
        mean: number;
        sd: number;
        cv: number;
      };
      deadCells?: {
        mean: number;
        sd: number;
        cv: number;
      };
      viability?: {
        mean: number;
        sd: number;
        cv: number;
      };
    };
    cellCountData?: {
      totalCells: number;
      liveCells: number;
      deadCells: number;
      viability: number;
    };
    imageMetadata?: {
      bf?: string;
      red?: string;
      green?: string;
      result?: string;
      resultId?: string;
    };
    protocolName?: string;
    operator?: string;
    pathlength?: number;
    unit: string;
  };
}
