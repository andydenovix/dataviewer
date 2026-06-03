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

// Helper to handle numeric strings with commas like "1,526.844"
export const parseScientificNum = (val: any): number => {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val.replace(/,/g, ''));
  return 0;
};