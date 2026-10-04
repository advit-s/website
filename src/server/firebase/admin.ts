import "server-only";
import { cert, getApps, initializeApp, applicationDefault, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { env } from "../env";

/**
 * The ONLY module that initialises the Firebase Admin SDK. Credentials come from Application Default
 * Credentials (App Hosting / gcloud) or explicit env vars - never a checked-in JSON file. In local mode the
 * SDK talks to the emulators (FIRESTORE_EMULATOR_HOST etc.) and no credentials are needed.
 */
function app(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const e = env();
  const projectId = e.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = e.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? `${projectId}.appspot.com`;
  if (e.FIREBASE_CLIENT_EMAIL && e.FIREBASE_PRIVATE_KEY) {
    return initializeApp({
      credential: cert({ projectId, clientEmail: e.FIREBASE_CLIENT_EMAIL, privateKey: e.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n") }),
      projectId,
      storageBucket,
    });
  }
  if (e.FIRESTORE_EMULATOR_HOST || e.FIREBASE_AUTH_EMULATOR_HOST) {
    return initializeApp({ projectId, storageBucket });
  }
  return initializeApp({ credential: applicationDefault(), projectId, storageBucket });
}

const g = globalThis as unknown as { __rrDb?: Firestore };

export function db(): Firestore {
  if (!g.__rrDb) {
    const fs = getFirestore(app());
    try {
      fs.settings({ ignoreUndefinedProperties: true });
    } catch {
      // settings() may only be called once per instance (dev hot reload) - safe to ignore.
    }
    g.__rrDb = fs;
  }
  return g.__rrDb;
}
export function adminAuth(): Auth {
  return getAuth(app());
}
export function bucket() {
  return getStorage(app()).bucket();
}
