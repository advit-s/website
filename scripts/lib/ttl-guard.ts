/**
 * Target safeguards for the TTL migration. The default and only unattended target is the local Firestore emulator.
 * A real project needs the operator to state the project id, acknowledge cloud changes, AND set an environment variable
 * that only the owner/authorised operator would set. Production-looking targets are not special-cased: the three
 * confirmations are required for every non-emulator project.
 */
export function assertTtlTarget(args: string[], env: Record<string, string | undefined>): "emulator" | "cloud" {
  const emulator = env.FIRESTORE_EMULATOR_HOST;
  const project = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
  if (emulator) {
    if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(emulator)) throw new Error(`Refusing: FIRESTORE_EMULATOR_HOST (${emulator}) is not a local address.`);
    return "emulator";
  }
  const confirm = args.find((a) => a.startsWith("--project-id="))?.slice(13);
  if (!project || confirm !== project) throw new Error(`Refusing: not using the Firestore emulator. To touch the REAL project "${project || "unset"}" pass --project-id=${project || "<id>"}.`);
  if (!args.includes("--allow-cloud")) throw new Error("Refusing: pass --allow-cloud to acknowledge this changes cloud data.");
  if (env.CONFIRM_TTL_MIGRATION !== project) throw new Error(`Refusing: set CONFIRM_TTL_MIGRATION=${project} in the environment (owner authorisation).`);
  return "cloud";
}
