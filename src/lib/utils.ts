import { FieldValue } from "firebase/firestore";

// Helper function to convert Firestore Timestamp (or raw object) to a Date object
export const convertFirestoreTimestampToDate = (timestamp: Date | { seconds: number; nanoseconds: number } | FieldValue): Date | null => {
  if (timestamp instanceof Date) {
    return timestamp;
  } else if (typeof timestamp === 'object' && timestamp !== null && 'seconds' in timestamp && 'nanoseconds' in timestamp) {
    return new Date(timestamp.seconds * 1000 + timestamp.nanoseconds / 1_000_000);
  }
  return null; // Or throw an error, depending on desired error handling
};

// Helper to handle numeric strings with commas like "1,526.844".
// Returns null when the value is missing or unparseable so callers can
// distinguish "zero" from "not present".
export const parseScientificNum = (val: any): number | null => {
  if (typeof val === 'number') return isNaN(val) ? null : val;
  if (typeof val === 'string') {
    const n = parseFloat(val.replace(/,/g, ''));
    return isNaN(n) ? null : n;
  }
  return null;
};