import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getFirestore, Firestore, initializeFirestore } from "firebase/firestore";
import { getAuth, Auth } from "firebase/auth";
import { getStorage, FirebaseStorage } from "firebase/storage";

// Helper to strip quotes/spaces if they were accidentally added in .env.local
const sanitize = (val: string | undefined) => {
  if (!val || val === 'undefined' || val === 'null' || val.includes('your-actual-api-key')) {
    return undefined;
  }
  return val.replace(/['",;]+/g, '').trim();
};

const firebaseConfig = {
  apiKey: sanitize(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
  authDomain: sanitize(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: sanitize(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
  storageBucket: sanitize(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: sanitize(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
  appId: sanitize(process.env.NEXT_PUBLIC_FIREBASE_APP_ID)
};

// Debugging: Check if config is loaded. 
const isConfigValid = !!firebaseConfig.apiKey;

let app: FirebaseApp;
let db: Firestore;
let auth: Auth;
let storage: FirebaseStorage;

if (typeof window !== "undefined") {
  if (!isConfigValid) {
    const missing = Object.entries(firebaseConfig)
      .filter(([_, v]) => !v)
      .map(([k]) => k);
    console.error(`CRITICAL: Firebase config missing fields: ${missing.join(', ')}. Check .env.local and RESTART your server.`);
  }

  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    db = initializeFirestore(app, {
      ignoreUndefinedProperties: true
    });
    auth = getAuth(app);
    storage = getStorage(app);
  } catch (err) {
    console.error("Firebase Initialization Error:", err);
    // Prevent immediate crash of the AuthProvider
    app = {} as FirebaseApp;
    db = {} as Firestore;
    auth = {} as Auth;
    storage = {} as FirebaseStorage;
  }
}

export { db, auth, storage };