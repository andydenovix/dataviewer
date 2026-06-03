/**
 * Image Association Service
 * Matches image filenames to sample records based on naming conventions.
 * 
 * Expected filename format:
 * {SampleName}_{ResultID}_{ImageType}_{Timestamp}.{ext}
 * Example: MyCell Sample_97_bf_0709720241115082924.png
 * 
 * Image types: bf (brightfield), red (PI), green (AO), result (overlay)
 */

export interface ParsedImageFilename {
  sampleNamePart: string;
  resultId: string;
  imageType: 'bf' | 'red' | 'green' | 'result';
  timestamp: string;
  extension: string;
  originalFilename: string;
}

export interface ImageAssociationMap {
  lookupKey: string; // "{SampleName}_{ResultID}" for matching
  images: {
    bf?: ParsedImageFilename;
    red?: ParsedImageFilename;
    green?: ParsedImageFilename;
    result?: ParsedImageFilename;
  };
}

/**
 * Parses an image filename according to the expected naming convention.
 * Returns null if filename doesn't match the pattern.
 */
export const parseImageFilename = (filename: string): ParsedImageFilename | null => {
  // Pattern: anything_{resultID}_{imageType}_{timestamp}.{ext}
  const regex = /^(.+?)_(\d+)_(bf|red|green|result)_([0-9a-zA-Z]+)\.(png|jpg|jpeg|webp|pdf)$/i;
  const match = filename.match(regex);

  if (!match) {
    console.warn(`Image filename does not match expected pattern: ${filename}`);
    return null;
  }

  const [, sampleNamePart, resultId, imageType, timestamp, extension] = match;

  return {
    sampleNamePart: sampleNamePart.replace(/_/g, ' ').trim(),
    resultId: resultId.trim(),
    imageType: imageType.toLowerCase() as 'bf' | 'red' | 'green' | 'result',
    timestamp: timestamp.trim(),
    extension: extension.toLowerCase(),
    originalFilename: filename,
  };
};

/**
 * Creates a lookup key from sample name and result ID.
 * Used to match parsed images to sample records.
 */
export const createLookupKey = (sampleName: string, resultId: string): string => {
  return `${sampleName.replace(/\s+/g, '_')}_${resultId}`.toLowerCase();
};

/**
 * Groups image files by sample based on parsing.
 * Returns a map of lookup keys to their associated images.
 */
export const groupImagesByLookupKey = (
  imageFiles: File[]
): Map<string, ImageAssociationMap['images']> => {
  const groupMap = new Map<string, ImageAssociationMap['images']>();

  imageFiles.forEach((file) => {
    const parsed = parseImageFilename(file.name);
    if (!parsed) return;

    const lookupKey = createLookupKey(parsed.sampleNamePart, parsed.resultId);

    if (!groupMap.has(lookupKey)) {
      groupMap.set(lookupKey, {});
    }

    const images = groupMap.get(lookupKey)!;
    images[parsed.imageType] = parsed;
  });

  return groupMap;
};

/**
 * Validates that a sample has a complete image set (all 4 types).
 */
export const hasCompleteImageSet = (
  images: ImageAssociationMap['images']
): boolean => {
  return !!(images.bf && images.red && images.green && images.result);
};

/**
 * Gets summary stats for image grouping results.
 */
export const getImageGroupingSummary = (
  groupMap: Map<string, ImageAssociationMap['images']>
): {
  totalSamples: number;
  completeImageSets: number;
  incompleteImageSets: number;
  missingImages: Map<string, string[]>;
} => {
  const summary = {
    totalSamples: groupMap.size,
    completeImageSets: 0,
    incompleteImageSets: 0,
    missingImages: new Map<string, string[]>(),
  };

  groupMap.forEach((images, lookupKey) => {
    if (hasCompleteImageSet(images)) {
      summary.completeImageSets++;
    } else {
      summary.incompleteImageSets++;
      const missing: string[] = [];
      if (!images.bf) missing.push('BF');
      if (!images.red) missing.push('Red');
      if (!images.green) missing.push('Green');
      if (!images.result) missing.push('Result');
      summary.missingImages.set(lookupKey, missing);
    }
  });

  return summary;
};

/**
 * Extracts the result ID from a sample name that includes it.
 * Example: "MyCell Sample 97" → "97"
 * Returns null if no result ID found.
 */
export const extractResultIdFromSampleName = (sampleName: string): string | null => {
  // Look for trailing numbers after the last space
  const match = sampleName.match(/(\d+)\s*$/);
  return match ? match[1] : null;
};
