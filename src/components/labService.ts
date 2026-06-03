import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  getDoc,
  query, 
  where, 
  getDocs, 
  serverTimestamp,
  writeBatch,
  orderBy,
  onSnapshot,
  arrayUnion
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface Lab {
  id: string;
  name: string;
  joinCode: string;
  creatorId: string;
  members: string[]; // User IDs
}

export async function getUserLabs(userId: string): Promise<Lab[]> {
  const q = query(collection(db, "labs"), where("members", "array-contains", userId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Lab));
}

export async function createLab(name: string, userId: string): Promise<string> {
  const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const docRef = await addDoc(collection(db, "labs"), {
    name,
    creatorId: userId,
    members: [userId],
    joinCode,
    createdAt: serverTimestamp()
  });
  return docRef.id;
}

export async function joinLab(joinCode: string, userId: string): Promise<void> {
  const q = query(collection(db, "labs"), where("joinCode", "==", joinCode.toUpperCase()));
  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    throw new Error("Invalid join code. Please check with your lab manager.");
  }
  const labId = snapshot.docs[0].id;
  await updateDoc(doc(db, "labs", labId), {
    members: arrayUnion(userId)
  });
}

/**
 * Deletes a lab group and unshares all samples.
 */
export async function deleteLab(labId: string) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "labs", labId));

  const q = query(collection(db, "samples"), where("sharedWithLabId", "==", labId));
  const snapshot = await getDocs(q);
  snapshot.docs.forEach(d => {
    batch.update(d.ref, { sharedWithLabId: null });
  });

  await batch.commit();
}

export async function shareSamplesWithLab(sampleIds: string[], labId: string, userId: string, userName: string) {
  const batch = writeBatch(db);
  sampleIds.forEach(id => {
    batch.update(doc(db, "samples", id), { sharedWithLabId: labId });
  });

  // Create notifications for lab members
  const labDoc = await getDoc(doc(db, "labs", labId));
  const members = labDoc.data()?.members || [];

  members.forEach((memberId: string) => {
    if (memberId !== userId) {
      batch.set(doc(collection(db, "notifications")), {
        userId: memberId,
        type: 'share',
        message: `${userName} shared data with the lab.`,
        createdAt: serverTimestamp(),
        isRead: false
      });
    }
  });

  await batch.commit();
}

export async function addComment(sampleId: string, userId: string, userName: string, text: string) {
  await addDoc(collection(db, "comments"), {
    sampleId,
    userId,
    userName,
    text,
    createdAt: serverTimestamp()
  });
}

export function listenToNotifications(userId: string, callback: (notifs: any[]) => void) {
  const q = query(
    collection(db, "notifications"), 
    where("userId", "==", userId),
    where("isRead", "==", false),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}