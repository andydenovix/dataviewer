import {
  writeBatch, doc, collection, Timestamp, getDocs, query, where,
} from 'firebase/firestore';
import { db } from './firebase';

// ── Wavelength grid: 220–320 nm, 2 nm steps (51 points) ──────────────────────
const WL = Array.from({ length: 51 }, (_, i) => 220 + i * 2);
const wi = (nm: number) => (nm - 220) / 2;

// ── Base normalized DNA absorbance (A260 = 1.0) ───────────────────────────────
// Key values at anchor wavelengths:
//   A230 = 0.460  → 260/230 = 2.17  (PASS dsDNA: min 2.00)
//   A250 = 1.005  → A250/A260 > 0.99 (PASS rule 6 aromatic shoulder)
//   A260 = 1.000  (peak)
//   A270 = 0.680  → 270/260 = 0.68   (PASS rule 3 phenol: threshold 0.72)
//   A280 = 0.535  → 260/280 = 1.87   (PASS dsDNA: min 1.80) & A280/A260 < 0.56 (PASS rule 5)
//   A320 = 0.010  → 320/260 = 0.01   (PASS rule 1 particulates: threshold 0.05)
const BASE: number[] = [
  // 220    222    224    226    228    230    232    234    236    238
  0.420, 0.400, 0.385, 0.395, 0.430, 0.460, 0.505, 0.560, 0.625, 0.700,
  // 240    242    244    246    248    250    252    254    256    258
  0.778, 0.842, 0.888, 0.930, 0.968, 1.005, 0.992, 0.995, 0.998, 1.000,
  // 260    262    264    266    268    270    272    274    276    278
  1.000, 0.980, 0.950, 0.900, 0.825, 0.680, 0.618, 0.568, 0.544, 0.534,
  // 280    282    284    286    288    290    292    294    296    298
  0.535, 0.488, 0.428, 0.358, 0.282, 0.208, 0.144, 0.094, 0.059, 0.037,
  // 300    302    304    306    308    310    312    314    316    318    320
  0.023, 0.015, 0.010, 0.007, 0.005, 0.004, 0.003, 0.003, 0.002, 0.002, 0.010,
];

// Gaussian addition (all values in index units)
function gauss(abs: number[], centerNm: number, amp: number, sigmaNm: number) {
  const ci = wi(centerNm);
  const si = sigmaNm / 2; // convert nm to index units (2 nm per step)
  for (let i = 0; i < abs.length; i++) {
    const d = (i - ci) / si;
    abs[i] += amp * Math.exp(-0.5 * d * d);
  }
}

const jit = (v: number, scale = 0.004) => Math.max(0, v + (Math.random() - 0.5) * scale);

type SpectrumVariant =
  | 'dna-clean'
  | 'dna-protein'     // elevated A280 → 260/280 ≈ 1.40 → FAIL dsDNA + rule 5
  | 'dna-salt'        // elevated A230 → 260/230 ≈ 1.55 → FAIL dsDNA
  | 'dna-particulate' // Rayleigh scatter → A320 > 0.05 → rule 1 warning
  | 'dna-phenol'      // 270 nm shoulder → A270/A260 > 0.72 → rule 3 FAIL (passes ratio QC!)
  | 'rna-clean'       // lower A280 → 260/280 ≈ 2.15 → PASS RNA
  | 'rna-protein'     // elevated A280 → 260/280 ≈ 1.48 → FAIL RNA QC
  | 'rna-salt'        // elevated A230 → 260/230 ≈ 1.55 → FAIL RNA QC
  | 'rna-phenol';     // 270 nm shoulder → spectral FAIL (may still pass ratio QC)

function buildSpectrum(variant: SpectrumVariant, a260: number) {
  const abs = [...BASE];

  switch (variant) {
    case 'dna-protein':
      gauss(abs, 280, +0.18, 6);  // A280 → 0.715  → 260/280 ≈ 1.40 → FAIL
      break;
    case 'dna-salt':
      gauss(abs, 228, +0.20, 5);  // A230 → 0.647  → 260/230 ≈ 1.55 → FAIL
      break;
    case 'dna-particulate':
      // Rayleigh scatter: λ^-4 dependence
      for (let i = 0; i < abs.length; i++) {
        abs[i] += 0.10 * Math.pow(260 / WL[i], 4) * 0.42; // normalised so it's subtle
      }
      abs[wi(320)] = 0.082; // ensure A320 > 0.05 triggers rule 1
      break;
    case 'dna-phenol':
      gauss(abs, 270, +0.09, 5);  // A270 → 0.770  → 270/260 > 0.72 → FAIL rule 3
      break;
    case 'rna-clean':
      gauss(abs, 280, -0.07, 6);  // A280 → 0.465  → 260/280 ≈ 2.15 → PASS RNA
      abs[wi(230)] -= 0.015;
      break;
    case 'rna-protein':
      gauss(abs, 280, +0.14, 6);  // A280 → 0.675  → 260/280 ≈ 1.48 → FAIL RNA
      gauss(abs, 280, -0.04, 3);  // slight narrowing (RNA still absorbs less at 280 than DNA)
      break;
    case 'rna-salt':
      gauss(abs, 228, +0.20, 5);  // A230 → 0.647  → 260/230 ≈ 1.55 → FAIL RNA
      gauss(abs, 280, -0.05, 6);  // still RNA-like at 280
      break;
    case 'rna-phenol':
      gauss(abs, 270, +0.11, 4);  // A270 → 0.790  → 270/260 > 0.72 → FAIL rule 3
      gauss(abs, 280, -0.05, 6);  // RNA character
      break;
  }

  return {
    wavelengths: WL,
    absorbance: abs.map(v => +jit(v * a260).toFixed(4)),
  };
}

// Pre-computed ratios for each variant (from the Gaussian math above)
const RATIOS: Record<SpectrumVariant, { r280: number; r230: number }> = {
  'dna-clean':      { r280: 1.87, r230: 2.17 },
  'dna-protein':    { r280: 1.40, r230: 2.17 },
  'dna-salt':       { r280: 1.87, r230: 1.55 },
  'dna-particulate':{ r280: 1.74, r230: 2.00 }, // slightly affected by scatter baseline
  'dna-phenol':     { r280: 1.87, r230: 2.17 }, // passes ratio QC — only spectral detects it!
  'rna-clean':      { r280: 2.15, r230: 2.22 },
  'rna-protein':    { r280: 1.48, r230: 2.17 },
  'rna-salt':       { r280: 2.08, r230: 1.55 },
  'rna-phenol':     { r280: 2.08, r230: 2.17 }, // passes ratio QC — only spectral detects it!
};

function rj(v: number) { return +(v + (Math.random() - 0.5) * 0.04).toFixed(2); }
function ts(daysAgo: number) {
  return Timestamp.fromDate(new Date(Date.now() - daysAgo * 86_400_000 - Math.random() * 3_600_000));
}

// ─────────────────────────────────────────────────────────────────────────────

export async function hasDemoData(userId: string): Promise<boolean> {
  const snap = await getDocs(
    query(collection(db, 'samples'), where('userId', '==', userId), where('isDemo', '==', true))
  );
  return !snap.empty;
}

export async function clearDemoData(userId: string): Promise<{ samples: number; protocols: number }> {
  const [sSnap, pSnap] = await Promise.all([
    getDocs(query(collection(db, 'samples'), where('userId', '==', userId), where('isDemo', '==', true))),
    getDocs(query(collection(db, 'protocols'), where('userId', '==', userId), where('isDemo', '==', true))),
  ]);

  // Firestore batch limit is 500; delete in chunks if needed
  const allRefs = [...sSnap.docs.map(d => d.ref), ...pSnap.docs.map(d => d.ref)];
  for (let i = 0; i < allRefs.length; i += 490) {
    const batch = writeBatch(db);
    allRefs.slice(i, i + 490).forEach(ref => batch.delete(ref));
    await batch.commit();
  }
  return { samples: sSnap.size, protocols: pSnap.size };
}

export async function seedDemoData(userId: string): Promise<void> {
  const batch = writeBatch(db);

  // ── 1. PROTOCOLS ────────────────────────────────────────────────────────────
  const dnaProtoRef  = doc(collection(db, 'protocols'));
  const rnaProtoRef  = doc(collection(db, 'protocols'));
  const cellProtoRef = doc(collection(db, 'protocols'));

  const baseProto = { userId, isDemo: true, requiredFields: [], createdAt: Timestamp.now() };

  batch.set(dnaProtoRef, {
    ...baseProto,
    name: 'gDNA Extraction — DNeasy Kit',
    description: 'Genomic DNA for NGS library prep. Requires 260/280 ≥ 1.80 and concentration ≥ 10 ng/µL.',
    kitName: 'DNeasy Blood & Tissue Kit',
    sampleType: 'Tissue / Blood',
    application: 'DNA',
    qcPreset: 'dsDNA',
    operatorNotes: 'Elute in 100 µL AE buffer. Allow buffer to sit on membrane for 1 min before centrifuging.',
  });

  batch.set(rnaProtoRef, {
    ...baseProto,
    name: 'Total RNA — RNeasy Kit',
    description: 'Total RNA for gene expression and sequencing. Strict purity requirements.',
    kitName: 'RNeasy Mini Kit',
    sampleType: 'Cell / Tissue',
    application: 'RNA',
    qcPreset: 'RNA',
    operatorNotes: 'Perform on-column DNase digest. Elute in RNase-free water. Process on ice at all times.',
  });

  batch.set(cellProtoRef, {
    ...baseProto,
    name: 'CHO Cell Viability',
    description: 'Trypan blue exclusion viability assay for CHO bioreactor samples.',
    kitName: 'Via2-Cassette (NucleoCounter)',
    sampleType: 'Cell Suspension',
    application: 'Cell Count',
    qcPreset: 'Cell Counting',
    operatorNotes: 'Dilute 1:1 in Via2 reagent. Count within 5 min. Flag batches < 80% viability.',
  });

  const dnaProtoName  = 'gDNA Extraction — DNeasy Kit';
  const rnaProtoName  = 'Total RNA — RNeasy Kit';
  const cellProtoName = 'CHO Cell Viability';

  // ── 2. DNA QC CONTROLS (Levey-Jennings) ─────────────────────────────────────
  // 20 control samples over 60 days. First 10 all above overall mean (~103 ng/µL)
  // → triggers Westgard 10x rule. Points at days 15 and 3 are 1-2s warnings.
  const ctrlPoints: Array<{ days: number; conc: number }> = [
    { days: 58, conc: 104 }, { days: 55, conc: 106 }, { days: 52, conc: 105 },
    { days: 49, conc: 103 }, { days: 46, conc: 107 }, { days: 43, conc: 104 },
    { days: 40, conc: 106 }, { days: 37, conc: 103 }, { days: 34, conc: 105 },
    { days: 31, conc: 104 }, // ← end of 10-consecutive-above-mean run
    { days: 28, conc: 100 }, { days: 25, conc: 99  }, { days: 22, conc: 101 },
    { days: 19, conc: 98  }, { days: 16, conc: 99  }, { days: 13, conc: 100 },
    { days: 10, conc: 99  }, { days: 7,  conc: 113 }, // +~2SD warning
    { days: 4,  conc: 88  }, // −~2SD warning
    { days: 1,  conc: 99  },
  ];

  for (const { days, conc } of ctrlPoints) {
    const a260 = conc / 50;
    const ratios = RATIOS['dna-clean'];
    const ref = doc(collection(db, 'samples'));
    batch.set(ref, {
      userId, isDemo: true,
      sampleName: 'DNA ctrl std',
      sampleType: 'spectro',
      application: 'DNA',
      concentration: conc + (Math.random() - 0.5) * 1.5,
      ratios: { '260/280': rj(ratios.r280), '260/230': rj(ratios.r230) },
      data: buildSpectrum('dna-clean', a260),
      protocolId: dnaProtoRef.id,
      measuredAt: ts(days),
      createdAt: ts(days),
      metadata: { unit: 'ng/µL', protocolName: dnaProtoName, isDemo: true },
    });
  }

  // ── 3. DNA RESEARCH SAMPLES ──────────────────────────────────────────────────
  const dnaSamples: Array<{
    name: string; days: number; variant: SpectrumVariant; conc: number; note?: string;
  }> = [
    { name: 'HEK293 gDNA — Rep 1',    days: 44, variant: 'dna-clean',       conc: 87  },
    { name: 'HEK293 gDNA — Rep 2',    days: 44, variant: 'dna-clean',       conc: 91  },
    { name: 'HEK293 gDNA — Rep 3',    days: 44, variant: 'dna-clean',       conc: 84  },
    { name: 'Tissue A — High Yield',  days: 32, variant: 'dna-clean',       conc: 198 },
    { name: 'Tissue B — Good Prep',   days: 28, variant: 'dna-clean',       conc: 143 },
    { name: 'PBMC gDNA — Protein',    days: 21, variant: 'dna-protein',     conc: 76  }, // FAIL 260/280
    { name: 'Buccal Swab — Salt',     days: 18, variant: 'dna-salt',        conc: 124 }, // FAIL 260/230
    { name: 'FFPE DNA — Particulates',days: 14, variant: 'dna-particulate', conc: 95  }, // spectral warning
    { name: 'Urine DNA — Low Yield',  days: 10, variant: 'dna-clean',       conc: 6   }, // FAIL min conc
    { name: 'Liver gDNA — Phenol',    days: 6,  variant: 'dna-phenol',      conc: 112 }, // PASS QC, FAIL spectral
  ];

  for (const s of dnaSamples) {
    const a260 = s.conc / 50;
    const ratios = RATIOS[s.variant];
    const ref = doc(collection(db, 'samples'));
    batch.set(ref, {
      userId, isDemo: true,
      sampleName: s.name,
      sampleType: 'spectro',
      application: 'DNA',
      concentration: +(s.conc + (Math.random() - 0.5) * 2).toFixed(1),
      ratios: { '260/280': rj(ratios.r280), '260/230': rj(ratios.r230) },
      data: buildSpectrum(s.variant, a260),
      protocolId: dnaProtoRef.id,
      measuredAt: ts(s.days),
      createdAt: ts(s.days),
      metadata: { unit: 'ng/µL', protocolName: dnaProtoName, isDemo: true },
    });
  }

  // ── 4. FLUORESCENCE COUNTERPARTS (for Method Pairing / QC Matcher) ────────────
  // Names match the spectro samples exactly so QCMatcher auto-detects the pairs.
  // Story: clean samples agree closely (pass delta); contaminated spectro samples
  // read artificially HIGH (protein / scatter absorbs at 260 but doesn't fluoresce)
  // → large delta → fail. User runs "Method Pairing" to link them and see scores.
  const fluorSamples: Array<{ name: string; days: number; conc: number }> = [
    // Clean — spectro ≈ fluor (delta 2–4 %, PASS < 20 %)
    { name: 'HEK293 gDNA — Rep 1',    days: 44, conc: 85.2  },  // spectro ~87   → Δ 2.1 %
    { name: 'HEK293 gDNA — Rep 2',    days: 44, conc: 88.5  },  // spectro ~91   → Δ 2.8 %
    { name: 'HEK293 gDNA — Rep 3',    days: 44, conc: 82.3  },  // spectro ~84   → Δ 2.1 %
    { name: 'Tissue B — Good Prep',   days: 28, conc: 131.0 },  // spectro ~143  → Δ 8.5 % PASS
    // Contaminated — spectro inflated, fluor accurate (delta > 20 %, FAIL)
    { name: 'Tissue A — High Yield',  days: 32, conc: 144.0 },  // spectro ~198  → Δ 31.6 % FAIL (OD absorbers)
    { name: 'PBMC gDNA — Protein',    days: 21, conc: 44.5  },  // spectro ~76   → Δ 51.9 % FAIL (protein absorbs 260)
    { name: 'FFPE DNA — Particulates',days: 14, conc: 68.0  },  // spectro ~95   → Δ 33.1 % FAIL (scatter inflates OD)
  ];

  for (const s of fluorSamples) {
    const ref = doc(collection(db, 'samples'));
    batch.set(ref, {
      userId, isDemo: true,
      sampleName: s.name,
      sampleType: 'fluor',
      application: 'DNA',
      concentration: +(s.conc + (Math.random() - 0.5) * 1.5).toFixed(1),
      ratios: {},
      assay: 'dsDNA (HS)',
      protocolId: dnaProtoRef.id,
      measuredAt: ts(s.days),
      createdAt: ts(s.days),
      metadata: { unit: 'ng/µL', protocolName: dnaProtoName, isDemo: true },
    });
  }

  // ── 6. RNA RESEARCH SAMPLES ──────────────────────────────────────────────────
  const rnaSamples: Array<{
    name: string; days: number; variant: SpectrumVariant; conc: number;
  }> = [
    { name: 'Brain RNA — High Purity',  days: 42, variant: 'rna-clean',   conc: 548  },
    { name: 'Lung RNA — Good Yield',    days: 38, variant: 'rna-clean',   conc: 724  },
    { name: 'Liver RNA — Standard',     days: 35, variant: 'rna-clean',   conc: 387  },
    { name: 'Kidney RNA — Good Purity', days: 30, variant: 'rna-clean',   conc: 462  },
    { name: 'Heart RNA — Protein',      days: 25, variant: 'rna-protein', conc: 215  }, // FAIL 260/280 < 2.00
    { name: 'Colon RNA — Salt',         days: 20, variant: 'rna-salt',    conc: 334  }, // FAIL 260/230 < 2.00
    { name: 'Skin RNA — Phenol',        days: 15, variant: 'rna-phenol',  conc: 291  }, // PASS QC, FAIL spectral
    { name: 'Thymus RNA — Low Conc',    days: 8,  variant: 'rna-clean',   conc: 31   }, // FAIL min conc (< 50)
  ];

  for (const s of rnaSamples) {
    const a260 = s.conc / 40; // RNA: ~40 ng/µL per OD unit (ssRNA)
    const ratios = RATIOS[s.variant];
    const ref = doc(collection(db, 'samples'));
    batch.set(ref, {
      userId, isDemo: true,
      sampleName: s.name,
      sampleType: 'spectro',
      application: 'RNA',
      concentration: +(s.conc + (Math.random() - 0.5) * 3).toFixed(1),
      ratios: { '260/280': rj(ratios.r280), '260/230': rj(ratios.r230) },
      data: buildSpectrum(s.variant, a260),
      protocolId: rnaProtoRef.id,
      measuredAt: ts(s.days),
      createdAt: ts(s.days),
      metadata: { unit: 'ng/µL', protocolName: rnaProtoName, isDemo: true },
    });
  }

  // ── 7. CELL COUNT SAMPLES ───────────────────────────────────────────────────
  const cellSamples: Array<{
    name: string; days: number; viability: number; totalCells: number; diameter: number;
  }> = [
    { name: 'CHO-K1 Batch 01 — Seed',     days: 55, viability: 97.2, totalCells: 4_250_000, diameter: 16.2 },
    { name: 'CHO-K1 Batch 02 — Growth',   days: 48, viability: 94.8, totalCells: 3_180_000, diameter: 16.5 },
    { name: 'CHO-K1 Batch 03 — Mid Exp',  days: 42, viability: 92.1, totalCells: 2_940_000, diameter: 16.8 },
    { name: 'CHO-K1 Batch 04 — Late Exp', days: 35, viability: 88.4, totalCells: 5_620_000, diameter: 17.1 },
    { name: 'CHO-K1 Batch 05 — Stressed', days: 28, viability: 78.3, totalCells: 2_150_000, diameter: 16.4 }, // FAIL viability < 80%
    { name: 'CHO-K1 Batch 06 — Decline',  days: 21, viability: 61.7, totalCells: 1_820_000, diameter: 15.8 }, // FAIL viability
    { name: 'CHO-K1 Batch 07 — Low Cnt',  days: 14, viability: 86.2, totalCells: 380_000,   diameter: 16.0 }, // FAIL min cell count
    { name: 'CHO-K1 Batch 08 — Dead',     days: 7,  viability: 12.4, totalCells: 205_000,   diameter: 14.2 }, // FAIL both
  ];

  for (const s of cellSamples) {
    const liveCells  = Math.round(s.totalCells * s.viability / 100);
    const deadCells  = s.totalCells - liveCells;
    const ref = doc(collection(db, 'samples'));
    batch.set(ref, {
      userId, isDemo: true,
      sampleName: s.name,
      sampleType: 'cell-count',
      application: 'Cell Count',
      concentration: null,
      ratios: {},
      protocolId: cellProtoRef.id,
      measuredAt: ts(s.days),
      createdAt: ts(s.days),
      metadata: {
        unit: 'cells/mL',
        protocolName: cellProtoName,
        isDemo: true,
        cellCountData: {
          totalCells: s.totalCells,
          liveCells,
          deadCells,
          viability: s.viability,
          meanDiameter: s.diameter,
        },
      },
    });
  }

  await batch.commit();
}
