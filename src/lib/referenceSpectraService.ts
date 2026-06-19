import { collection, addDoc, deleteDoc, doc, query, where, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { ReferenceSpectrum } from '@/types';

export async function addReferenceSpectrum(
  userId: string,
  data: Omit<ReferenceSpectrum, 'id' | 'userId' | 'addedAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, 'referenceSpectra'), {
    ...data,
    userId,
    addedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function removeReferenceSpectrum(id: string): Promise<void> {
  await deleteDoc(doc(db, 'referenceSpectra', id));
}

export function subscribeToReferenceSpectra(
  userId: string,
  onData: (refs: ReferenceSpectrum[]) => void
): () => void {
  const q = query(collection(db, 'referenceSpectra'), where('userId', '==', userId));
  return onSnapshot(q, snap => {
    onData(snap.docs.map(d => ({ id: d.id, ...d.data() } as ReferenceSpectrum)));
  });
}
