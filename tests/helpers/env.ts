// Integration tests talk ONLY to the local emulators. Fail fast if pointed anywhere else.
process.env.APP_ENV = "local";
process.env.INTEGRATION_MODE = "simulated";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-rajraani";
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
process.env.GCLOUD_PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
process.env.ORDER_TOKEN_SECRET = "test-order-token-secret";
process.env.JOB_SECRET = "test-job-secret";
process.env.SIMULATION_SECRET = "test-simulation-secret";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
delete process.env.NEXT_RUNTIME; // outside Next: caches degrade to plain calls

if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST)) {
  throw new Error("Integration tests must run against a local Firestore emulator.");
}
