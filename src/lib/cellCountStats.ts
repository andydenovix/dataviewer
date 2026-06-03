/**
 * Cell Count Statistics Utilities
 * Calculates mean, standard deviation, and coefficient of variation
 * for cell count data across replicates.
 */

export interface CellCountMetrics {
  totalCells: number;
  liveCells: number;
  deadCells: number;
  viability: number; // percentage (0-100)
}

export interface ReplicateStats {
  mean: number;
  sd: number; // Standard deviation
  cv: number; // Coefficient of variation (SD/Mean * 100)
}

export interface CellCountStatsSummary {
  totalCellCount: ReplicateStats;
  liveCells: ReplicateStats;
  deadCells: ReplicateStats;
  viability: ReplicateStats;
}

/**
 * Calculates standard deviation for a set of numbers.
 */
export const calculateStandardDeviation = (values: number[]): number => {
  if (values.length < 2) return 0;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (values.length - 1);

  return Math.sqrt(variance);
};

/**
 * Calculates coefficient of variation (CV) as a percentage.
 * CV = (SD / Mean) * 100
 * Returns 0 if mean is 0 to avoid division by zero.
 */
export const calculateCV = (sd: number, mean: number): number => {
  return mean === 0 ? 0 : (sd / mean) * 100;
};

/**
 * Calculates statistics for a single metric across multiple values.
 */
export const calculateMetricStats = (values: number[]): ReplicateStats => {
  if (values.length === 0) {
    return { mean: 0, sd: 0, cv: 0 };
  }

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = calculateStandardDeviation(values);
  const cv = calculateCV(sd, mean);

  return { mean, sd, cv };
};

/**
 * Calculates comprehensive statistics for a set of cell count samples.
 * Primarily used for replicates where we want to understand variability.
 */
export const calculateCellCountStats = (metrics: CellCountMetrics[]): CellCountStatsSummary | null => {
  if (metrics.length === 0) return null;

  const totalCells = metrics.map((m) => m.totalCells);
  const liveCells = metrics.map((m) => m.liveCells);
  const deadCells = metrics.map((m) => m.deadCells);
  const viability = metrics.map((m) => m.viability);

  return {
    totalCellCount: calculateMetricStats(totalCells),
    liveCells: calculateMetricStats(liveCells),
    deadCells: calculateMetricStats(deadCells),
    viability: calculateMetricStats(viability),
  };
};

/**
 * Extracts cell count metrics from a sample's metadata.
 * Returns null if metrics are not found in the sample.
 */
export const extractCellCountMetrics = (metadata: Record<string, any>): CellCountMetrics | null => {
  const cellCountData = metadata.cellCountData;

  if (!cellCountData) {
    return null;
  }

  return {
    totalCells: Number(cellCountData.totalCells) || 0,
    liveCells: Number(cellCountData.liveCells) || 0,
    deadCells: Number(cellCountData.deadCells) || 0,
    viability: Number(cellCountData.viability) || 0,
  };
};

/**
 * Formats statistics for display with appropriate precision.
 */
export const formatStats = (stats: ReplicateStats): {
  meanStr: string;
  sdStr: string;
  cvStr: string;
} => {
  // Format numbers with appropriate significant figures
  const formatNumber = (num: number): string => {
    if (num > 1000) {
      return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }
    if (num > 10) {
      return num.toFixed(1);
    }
    return num.toFixed(2);
  };

  return {
    meanStr: formatNumber(stats.mean),
    sdStr: formatNumber(stats.sd),
    cvStr: `${stats.cv.toFixed(1)}%`,
  };
};

/**
 * Validates that cell count metrics are within reasonable ranges.
 */
export const validateCellCountMetrics = (metrics: CellCountMetrics): {
  valid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];

  if (metrics.totalCells < 0) {
    errors.push('Total cells cannot be negative');
  }
  if (metrics.liveCells < 0) {
    errors.push('Live cells cannot be negative');
  }
  if (metrics.deadCells < 0) {
    errors.push('Dead cells cannot be negative');
  }
  if (metrics.viability < 0 || metrics.viability > 100) {
    errors.push('Viability must be between 0-100%');
  }
  if (metrics.liveCells + metrics.deadCells > metrics.totalCells * 1.01) {
    // Allow 1% tolerance for rounding
    errors.push('Live + Dead cells exceeds total cells');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};
