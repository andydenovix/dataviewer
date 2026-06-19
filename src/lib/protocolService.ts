import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { Protocol } from '@/types';

export async function createProtocol(userId: string, data: Omit<Protocol, 'id' | 'userId' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'protocols'), {
    ...data,
    userId,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateProtocol(id: string, data: Partial<Omit<Protocol, 'id' | 'userId' | 'createdAt'>>): Promise<void> {
  await updateDoc(doc(db, 'protocols', id), data);
}

export async function deleteProtocol(id: string): Promise<void> {
  await deleteDoc(doc(db, 'protocols', id));
}

export function subscribeToProtocols(userId: string, onData: (protocols: Protocol[]) => void): () => void {
  const q = query(collection(db, 'protocols'), where('userId', '==', userId));
  return onSnapshot(q, snap => {
    onData(snap.docs.map(d => ({ id: d.id, ...d.data() } as Protocol)));
  });
}
