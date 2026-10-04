/**
 * Safety guard for seed/reset scripts: they only run against the local emulators unless the operator
 * deliberately overrides with ALLOW_REMOTE_SEED=I-UNDERSTAND-THIS-WIPES-DATA and the project id is not a production one.
 */
export function assertLocalTarget(action: string): void {
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-rajraani";
  if (emulator) {
    if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(emulator)) {
      throw new Error(`Refusing to ${action}: FIRESTORE_EMULATOR_HOST (${emulator}) is not a local address.`);
    }
    return;
  }
  if (process.env.ALLOW_REMOTE_SEED === "I-UNDERSTAND-THIS-WIPES-DATA" && /^(demo-|.*-(dev|staging|test)$)/.test(project)) {
    console.warn(`WARNING: ${action} against non-emulator project "${project}".`);
    return;
  }
  throw new Error(
    `Refusing to ${action}: FIRESTORE_EMULATOR_HOST is not set (project "${project}"). ` +
      "Start the emulators (npm run emulators) and copy .env.example to .env.local. Production targets are never allowed.",
  );
}
