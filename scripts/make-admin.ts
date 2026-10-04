/**
 * Grant or revoke the `admin` custom claim. Trusted-operator tool: run from a machine that holds Admin credentials
 * (Application Default Credentials / GOOGLE_APPLICATION_CREDENTIALS - never a service-account file checked into the repo).
 *
 *   npm run make-admin -- owner@example.com                grant
 *   npm run make-admin -- owner@example.com --revoke       revoke
 *   npm run make-admin -- <uid> --project-id=<project>     against a real project (must match NEXT_PUBLIC_FIREBASE_PROJECT_ID)
 *
 * Other claims on the account are preserved. Refresh tokens are revoked, so every previously issued session (including an
 * old admin session after a revoke) stops working; the user must sign in again to pick up the change.
 */
import { adminAuth } from "@/server/firebase/admin";

async function main() {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith("--"));
  const revoke = args.includes("--revoke");
  if (!target) throw new Error("Usage: npm run make-admin -- <email|uid> [--revoke] [--project-id=<id>]");

  const emulator = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
  const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
  if (!emulator) {
    const confirm = args.find((a) => a.startsWith("--project-id="))?.slice(13);
    if (confirm !== project) throw new Error(`Not using the Auth emulator. To change a REAL project (${project || "unset"}) pass --project-id=${project || "<id>"} to confirm.`);
  }

  const auth = adminAuth();
  const user = target.includes("@") ? await auth.getUserByEmail(target) : await auth.getUser(target);
  const claims = { ...(user.customClaims ?? {}) } as Record<string, unknown>;
  if (revoke) delete claims.admin;
  else claims.admin = true;
  await auth.setCustomUserClaims(user.uid, claims);
  await auth.revokeRefreshTokens(user.uid);
  console.log(`${revoke ? "Revoked" : "Granted"} admin for ${user.email ?? user.phoneNumber ?? user.uid} (uid ${user.uid}). Existing sessions were revoked; sign in again.`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
