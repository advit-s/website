import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";

/**
 * Browser Firebase SDK. Used ONLY for credential flows (email/password, phone OTP, password reset).
 * The config values are public identifiers, not secrets; Firestore/Storage are never accessed from the browser.
 */
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "demo-api-key",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-rajraani",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let emulatorConnected = false;

export const usingEmulators = (): boolean => process.env.NEXT_PUBLIC_USE_EMULATORS === "true";

export function firebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(config);
}

export function firebaseAuth(): Auth {
  const auth = getAuth(firebaseApp());
  if (usingEmulators() && !emulatorConnected) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    // The emulator does not verify reCAPTCHA; skipping it avoids loading Google scripts locally.
    auth.settings.appVerificationDisabledForTesting = true;
    emulatorConnected = true;
  }
  return auth;
}
