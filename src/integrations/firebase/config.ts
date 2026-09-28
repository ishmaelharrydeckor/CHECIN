import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  type Auth,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  initializeFirestore,
  getFirestore,
  doc,
  setDoc,
  getDoc,
  type Firestore,
} from "firebase/firestore";
const getEnv = (key: string): string => {
  if (typeof import.meta !== "undefined" && (import.meta as any).env?.[key]) {
    return (import.meta as any).env[key];
  }
  if (typeof process !== "undefined" && process.env?.[key]) {
    return process.env[key] as string;
  }
  return "";
};

const apiKey = getEnv("VITE_FIREBASE_API_KEY");
const projectId = getEnv("VITE_FIREBASE_PROJECT_ID");

if (!apiKey || !projectId) {
  console.warn(
    "[Firebase Config] Missing VITE_FIREBASE_API_KEY or VITE_FIREBASE_PROJECT_ID. Please set them in your .env file.",
  );
}

const firebaseConfig = {
  apiKey,
  authDomain: getEnv("VITE_FIREBASE_AUTH_DOMAIN") || `${projectId}.firebaseapp.com`,
  projectId,
  storageBucket: getEnv("VITE_FIREBASE_STORAGE_BUCKET") || `${projectId}.firebasestorage.app`,
  messagingSenderId: getEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: getEnv("VITE_FIREBASE_APP_ID"),
};

let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

export const firebaseAuth: Auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account",
});

const databaseId = getEnv("VITE_FIREBASE_DATABASE_ID") || undefined;

let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      experimentalForceLongPolling: true,
      ignoreUndefinedProperties: true,
    },
    databaseId,
  );
} catch {
  firestoreInstance = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
}

export const firestoreDb: Firestore = firestoreInstance;

export interface AppUserProfile {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Syncs the authenticated Firebase user's display profile into Firestore.
 *
 * IMPORTANT: this document holds display fields only. Roles are NOT stored
 * or read here — they live exclusively in Firebase custom claims, granted
 * via the Admin-SDK-backed route in src/routes/api/admin/roles.ts. A client
 * must never be able to self-assign a role by writing to its own profile
 * doc, which is what the previous `role: existingProfile?.role ||
 * "super_admin"` fallback effectively allowed every new user to do.
 */
export async function syncUserToFirestore(user: FirebaseUser): Promise<AppUserProfile> {
  const userRef = doc(firestoreDb, "users", user.uid);
  const now = new Date().toISOString();

  let existingProfile: AppUserProfile | null = null;
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      existingProfile = snap.data() as AppUserProfile;
    }
  } catch (err) {
    console.warn("Could not read existing user doc from Firestore:", err);
  }

  const profile: AppUserProfile = {
    id: user.uid,
    email: user.email || "",
    displayName: user.displayName || user.email?.split("@")[0] || "User",
    photoURL: user.photoURL || undefined,
    createdAt: existingProfile?.createdAt || now,
    updatedAt: now,
  };

  try {
    await setDoc(userRef, profile, { merge: true });
  } catch (err) {
    console.warn("Could not write user doc to Firestore:", err);
  }

  return profile;
}

export { fbSignOut, onAuthStateChanged, signInWithPopup };
