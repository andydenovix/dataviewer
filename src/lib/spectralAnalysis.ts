// Pure spectral math — no React, no Firestore.

export interface AnomalyFlag {
  name: string;
  wavelengthRegion: string;
  description: string;
  likelyCause: string;
  severity: 'warning' | 'fail';
}

export interface ReferenceScore {
  name: string;
  similarity: number;  // cosine similarity 0-1
}

export interface SpectralScore {
  cosineSimilarity: number;  // best match among all references
  referenceCount: number;
  overallStatus: 'pass' | 'warn' | 'fail' | 'no-data';
  anomalyFlags: AnomalyFlag[];
  referenceScores: ReferenceScore[];
  bestReferenceMatch: string | null;
}

// ── Math primitives ───────────────────────────────────────────────────────────

function binarySearch(arr: number[], target: number): number {
  let lo = 0, hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (arr[mid] <= target) lo = mid; else hi = mid - 1;
  }
  return lo;
}

export function interpolateAt(wavelengths: number[], absorbance: number[], target: number): number {
  if (wavelengths.length === 0) return 0;
  if (target <= wavelengths[0]) return absorbance[0];
  if (target >= wavelengths[wavelengths.length - 1]) return absorbance[absorbance.length - 1];
  const lo = binarySearch(wavelengths, target);
  const hi = lo + 1;
  if (hi >= wavelengths.length) return absorbance[lo];
  const t = (target - wavelengths[lo]) / (wavelengths[hi] - wavelengths[lo]);
  return absorbance[lo] + t * (absorbance[hi] - absorbance[lo]);
}

export function interpolateToGrid(
  srcWL: number[], srcAbs: number[],
  gridWL: number[]
): number[] {
  return gridWL.map(w => interpolateAt(srcWL, srcAbs, w));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA < 1e-12 || magB < 1e-12) return 0;
  return Math.min(1, dot / (Math.sqrt(magA) * Math.sqrt(magB)));
}

// Build a wavelength grid covering the overlap of all supplied spectra
export function buildOverlapGrid(spectra: Array<{ wavelengths: number[] }>): number[] {
  if (spectra.length === 0) return [];
  const lo = Math.max(...spectra.map(s => s.wavelengths[0]));
  const hi = Math.min(...spectra.map(s => s.wavelengths[s.wavelengths.length - 1]));
  if (lo >= hi) return [];
  const grid: number[] = [];
  for (let w = Math.ceil(lo); w <= Math.floor(hi); w++) grid.push(w);
  return grid;
}

// ── Anomaly rule library ───────────────────────────────────────────────────────

const ANOMALY_RULES: Array<{
  name: string;
  wavelengthRegion: string;
  check(a230: number, a250: number, a260: number, a270: number, a280: number, a320: number): boolean;
  description: string;
  likelyCause: string;
  severity: 'warning' | 'fail';
}> = [
  {
    name: 'Particulates / aggregation',
    wavelengthRegion: '320–400 nm',
    check: (a230, a250, a260, a270, a280, a320) => a260 > 0.05 && a320 > 0.05 * a260,
    description: 'Elevated baseline above 320 nm where nucleic acids are transparent',
    likelyCause: 'Particulate matter or insoluble aggregates in solution. Centrifuge at 10,000×g for 5 min at 4°C, transfer supernatant to a fresh tube and re-measure.',
    severity: 'warning',
  },
  {
    name: 'Guanidinium / EDTA carryover',
    wavelengthRegion: '230 nm',
    check: (a230, a250, a260) => a260 > 0.05 && (a230 / a260) > 1.4,
    description: 'A₂₃₀/A₂₆₀ > 1.4 — excess UV absorbance at 230 nm',
    likelyCause: 'Guanidinium salt carryover from column lysis buffer, or EDTA/acetate contamination. Perform ≥2 wash steps on column with appropriate wash buffer and elute with nuclease-free water or 10 mM Tris-HCl pH 8.0.',
    severity: 'warning',
  },
  {
    name: 'Phenol contamination',
    wavelengthRegion: '270 nm shoulder',
    check: (a230, a250, a260, a270) => a260 > 0.05 && (a270 / a260) > 0.72,
    description: 'Pronounced 270 nm shoulder — classic spectral signature of phenol',
    likelyCause: 'Residual phenol from TRIzol or phenol-chloroform extraction. Ethanol precipitate the nucleic acid: add 2.5 vol 100% EtOH and 0.1 vol 3M NaOAc (pH 5.2), incubate at −20°C for 2 h, centrifuge at 12,000×g for 15 min, wash pellet twice with 75% EtOH, and air-dry before re-suspending.',
    severity: 'fail',
  },
  {
    name: 'Residual ethanol / isopropanol',
    wavelengthRegion: '220–235 nm',
    check: (a230, a250, a260) => a260 > 0.05 && (a230 / a260) > 1.9,
    description: 'Very high A₂₂₀–₂₃₅ consistent with residual organic solvent',
    likelyCause: 'Ethanol or isopropanol not fully removed after column wash or precipitation. After the final wash centrifugation step, leave the column/pellet open at room temperature for 2–5 min to evaporate solvent traces before eluting.',
    severity: 'warning',
  },
  {
    name: 'Protein co-purification',
    wavelengthRegion: '280 nm',
    check: (a230, a250, a260, a270, a280) => a260 > 0.05 && (a280 / a260) > 0.56,
    description: 'Elevated A₂₈₀ relative to A₂₆₀ — 260/280 ratio below expected range',
    likelyCause: 'Co-purified protein contaminant. Ensure complete proteinase K digestion and verify inactivation before extraction. Consider a secondary clean-up step with a silica-membrane spin column or add a phenol-chloroform back-extraction.',
    severity: 'warning',
  },
  {
    name: 'Aromatic / phenolic shoulder',
    wavelengthRegion: '250 nm',
    check: (a230, a250, a260) => a260 > 0.05 && (a250 / a260) > 0.88 && (a250 / a260) < 0.99,
    description: 'Broadened peak at 250 nm suggests phenolic or aromatic contaminant',
    likelyCause: 'Phenol, tyrosine-containing peptides, or aromatic solvents (e.g., toluene from some tissue processors). Perform an additional ethanol precipitation or use a clean-up column suited to the extraction method.',
    severity: 'warning',
  },
];

export function detectAnomalies(wavelengths: number[], absorbance: number[]): AnomalyFlag[] {
  if (wavelengths.length < 5) return [];
  const a = (wl: number) => interpolateAt(wavelengths, absorbance, wl);
  const a230 = a(230), a250 = a(250), a260 = a(260);
  const a270 = a(270), a280 = a(280), a320 = a(320);

  return ANOMALY_RULES
    .filter(r => r.check(a230, a250, a260, a270, a280, a320))
    .map(({ name, wavelengthRegion, description, likelyCause, severity }) => ({
      name, wavelengthRegion, description, likelyCause, severity,
    }));
}

// ── Full score computation ────────────────────────────────────────────────────

export function computeSpectralScore(
  sampleWL: number[],
  sampleAbs: number[],
  references: Array<{ sampleName: string; wavelengths: number[]; absorbance: number[] }>
): SpectralScore {
  if (sampleWL.length < 5) {
    return { cosineSimilarity: 0, referenceCount: 0, overallStatus: 'no-data', anomalyFlags: [], referenceScores: [], bestReferenceMatch: null };
  }

  const anomalyFlags = detectAnomalies(sampleWL, sampleAbs);

  let referenceScores: ReferenceScore[] = [];
  let cosSim = 0;
  let bestReferenceMatch: string | null = null;

  if (references.length > 0) {
    const allSpectra = [
      { wavelengths: sampleWL },
      ...references.map(r => ({ wavelengths: r.wavelengths })),
    ];
    const grid = buildOverlapGrid(allSpectra);

    if (grid.length >= 5) {
      const sampleGrid = interpolateToGrid(sampleWL, sampleAbs, grid);
      referenceScores = references.map(ref => ({
        name: ref.sampleName,
        similarity: cosineSimilarity(sampleGrid, interpolateToGrid(ref.wavelengths, ref.absorbance, grid)),
      })).sort((a, b) => b.similarity - a.similarity);

      cosSim = referenceScores[0]?.similarity ?? 0;
      bestReferenceMatch = referenceScores[0]?.name ?? null;
    }
  }

  let overallStatus: SpectralScore['overallStatus'] = 'pass';
  if (anomalyFlags.some(f => f.severity === 'fail'))   overallStatus = 'fail';
  else if (anomalyFlags.some(f => f.severity === 'warning')) overallStatus = 'warn';

  if (references.length > 0 && referenceScores.length > 0) {
    if (cosSim < 0.97)                                  overallStatus = 'fail';
    else if (cosSim < 0.99 && overallStatus === 'pass') overallStatus = 'warn';
  }

  return { cosineSimilarity: cosSim, referenceCount: references.length, overallStatus, anomalyFlags, referenceScores, bestReferenceMatch };
}
