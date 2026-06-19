import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { QCThresholds, QCProfile, QCViolation, LabSample } from '@/types';

// ─── Suggested presets ────────────────────────────────────────────────────────

export const QC_PRESETS: Record<string, QCThresholds> = {
  dsDNA: {
    ratio260_280:    { min: 1.80, max: 2.00, enabled: true  },
    ratio260_230:    { min: 2.00, max: 2.30, enabled: true  },
    minConcentration:{ value: 10,      enabled: true  },
    maxConcentration:{ value: 3000,    enabled: false },
    maxMethodDelta:  { value: 20,      enabled: true  },
    minViability:    { value: 0,       enabled: false },
    minCellCount:    { value: 0,       enabled: false },
  },
  RNA: {
    ratio260_280:    { min: 2.00, max: 2.20, enabled: true  },
    ratio260_230:    { min: 2.00, max: 2.30, enabled: true  },
    minConcentration:{ value: 50,      enabled: true  },
    maxConcentration:{ value: 0,       enabled: false },
    maxMethodDelta:  { value: 20,      enabled: true  },
    minViability:    { value: 0,       enabled: false },
    minCellCount:    { value: 0,       enabled: false },
  },
  Protein: {
    ratio260_280:    { min: 0,    max: 0,    enabled: false },
    ratio260_230:    { min: 0,    max: 0,    enabled: false },
    minConcentration:{ value: 0.1,     enabled: true  },
    maxConcentration:{ value: 0,       enabled: false },
    maxMethodDelta:  { value: 20,      enabled: true  },
    minViability:    { value: 0,       enabled: false },
    minCellCount:    { value: 0,       enabled: false },
  },
  'Cell Counting': {
    ratio260_280:    { min: 0,    max: 0,    enabled: false },
    ratio260_230:    { min: 0,    max: 0,    enabled: false },
    minConcentration:{ value: 0,       enabled: false },
    maxConcentration:{ value: 0,       enabled: false },
    maxMethodDelta:  { value: 0,       enabled: false },
    minViability:    { value: 80,      enabled: true  },
    minCellCount:    { value: 500000,  enabled: true  },
  },
  General: {
    ratio260_280:    { min: 1.70, max: 2.10, enabled: true  },
    ratio260_230:    { min: 1.80, max: 2.30, enabled: true  },
    minConcentration:{ value: 1,       enabled: true  },
    maxConcentration:{ value: 0,       enabled: false },
    maxMethodDelta:  { value: 20,      enabled: true  },
    minViability:    { value: 80,      enabled: false },
    minCellCount:    { value: 0,       enabled: false },
  },
};

export const DEFAULT_THRESHOLDS: QCThresholds = QC_PRESETS['General'];

// ─── Evaluation ───────────────────────────────────────────────────────────────

export function evaluateSampleQC(sample: LabSample, profile: QCProfile): QCViolation[] {
  const violations: QCViolation[] = [];
  const t = profile.thresholds;

  if (t.ratio260_280.enabled && sample.ratios?.['260/280'] !== undefined) {
    const val = sample.ratios['260/280'];
    if (val < t.ratio260_280.min || val > t.ratio260_280.max) {
      violations.push({
        field: '260/280',
        message: `260/280 ratio ${val.toFixed(2)} outside range ${t.ratio260_280.min}–${t.ratio260_280.max}`,
        severity: 'fail',
      });
    }
  }

  if (t.ratio260_230.enabled && sample.ratios?.['260/230'] !== undefined) {
    const val = sample.ratios['260/230'];
    if (val < t.ratio260_230.min || val > t.ratio260_230.max) {
      violations.push({
        field: '260/230',
        message: `260/230 ratio ${val.toFixed(2)} outside range ${t.ratio260_230.min}–${t.ratio260_230.max}`,
        severity: 'fail',
      });
    }
  }

  if (t.minConcentration.enabled && sample.concentration != null) {
    if (sample.concentration < t.minConcentration.value) {
      violations.push({
        field: 'concentration',
        message: `Concentration ${sample.concentration.toFixed(2)} below minimum ${t.minConcentration.value}`,
        severity: 'fail',
      });
    }
  }

  if (t.maxConcentration.enabled && t.maxConcentration.value > 0 && sample.concentration != null) {
    if (sample.concentration > t.maxConcentration.value) {
      violations.push({
        field: 'concentration',
        message: `Concentration ${sample.concentration.toFixed(2)} exceeds maximum ${t.maxConcentration.value}`,
        severity: 'warning',
      });
    }
  }

  if (t.maxMethodDelta.enabled && sample.qcMatchScore !== undefined && sample.qcMatchScore !== null) {
    if (sample.qcMatchScore > t.maxMethodDelta.value) {
      violations.push({
        field: 'methodDelta',
        message: `Method delta ${sample.qcMatchScore.toFixed(1)}% exceeds maximum ${t.maxMethodDelta.value}%`,
        severity: 'fail',
      });
    }
  }

  if (t.minViability.enabled && sample.metadata?.cellCountData?.viability !== undefined) {
    const v = sample.metadata.cellCountData.viability;
    if (v < t.minViability.value) {
      violations.push({
        field: 'viability',
        message: `Viability ${v.toFixed(1)}% below minimum ${t.minViability.value}%`,
        severity: 'fail',
      });
    }
  }

  if (t.minCellCount.enabled && sample.metadata?.cellCountData?.totalCells !== undefined) {
    const c = sample.metadata.cellCountData.totalCells;
    if (c < t.minCellCount.value) {
      violations.push({
        field: 'cellCount',
        message: `Total count ${c.toLocaleString()} below minimum ${t.minCellCount.value.toLocaleString()}`,
        severity: 'fail',
      });
    }
  }

  return violations;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

export async function savePersonalQCProfile(userId: string, profile: QCProfile): Promise<void> {
  await setDoc(doc(db, 'userSettings', userId), { qcProfile: profile }, { merge: true });
}

export async function loadPersonalQCProfile(userId: string): Promise<QCProfile | null> {
  const snap = await getDoc(doc(db, 'userSettings', userId));
  return (snap.data()?.qcProfile as QCProfile) ?? null;
}

export async function saveLabQCProfile(labId: string, profile: QCProfile): Promise<void> {
  await updateDoc(doc(db, 'labs', labId), { qcProfile: profile });
}
