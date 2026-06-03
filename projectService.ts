import { 
  getFirestore, 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  where, 
  getDocs, 
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';

const db = getFirestore();

export interface Project {
  id?: string;
  name: string;
  userId: string;
  createdAt: any;
}

/**
 * Creates a new project.
 */
export async function createProject(name: string, userId: string): Promise<string> {
  const docRef = await addDoc(collection(db, "projects"), {
    name,
    userId,
    createdAt: serverTimestamp()
  });
  return docRef.id;
}

/**
 * Fetches all projects for the current user to populate dropdowns.
 */
export async function getUserProjects(userId: string): Promise<Project[]> {
  const q = query(collection(db, "projects"), where("userId", "==", userId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Project));
}

/**
 * Updates a sample's project association. 
 * Used in the Sample Viewer for moving/adding to projects.
 */
export async function updateSampleProject(sampleId: string, projectId: string | null) {
  const sampleRef = doc(db, "samples", sampleId);
  await updateDoc(sampleRef, { projectId });
}

/**
 * Deletes a project and dissociates all its samples (sets projectId to null).
 */
export async function deleteProject(projectId: string) {
  const batch = writeBatch(db);
  
  // 1. Mark the project for deletion
  const projectRef = doc(db, "projects", projectId);
  batch.delete(projectRef);

  // 2. Find all samples associated with this project
  const q = query(collection(db, "samples"), where("projectId", "==", projectId));
  const snapshot = await getDocs(q);

  // 3. Update each sample to be unassigned
  snapshot.docs.forEach((sampleDoc) => {
    batch.update(sampleDoc.ref, { projectId: null });
  });

  await batch.commit();
}