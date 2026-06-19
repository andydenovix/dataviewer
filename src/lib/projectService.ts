import { collection, addDoc, updateDoc, doc, query, where, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

export interface Project {
  id?: string;
  name: string;
  userId: string;
  createdAt: any;
}

export async function createProject(name: string, userId: string): Promise<string> {
  const docRef = await addDoc(collection(db, 'projects'), {
    name,
    userId,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getUserProjects(userId: string): Promise<Project[]> {
  const q = query(collection(db, 'projects'), where('userId', '==', userId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Project));
}

export async function updateSampleProject(sampleId: string, projectId: string | null) {
  await updateDoc(doc(db, 'samples', sampleId), { projectId });
}

export async function deleteProject(projectId: string) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'projects', projectId));

  const q = query(collection(db, 'samples'), where('projectId', '==', projectId));
  const snapshot = await getDocs(q);
  snapshot.docs.forEach(sampleDoc => {
    batch.update(sampleDoc.ref, { projectId: null });
  });

  await batch.commit();
}
