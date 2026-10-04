import "server-only";
import { C, col, nowIso } from "./common";

export interface Profile {
  uid: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
}

export async function getProfile(uid: string): Promise<Profile | null> {
  const s = await col(C.users).doc(uid).get();
  if (!s.exists) return null;
  const d = s.data() as Omit<Profile, "uid">;
  return { uid, fullName: d.fullName ?? "", email: d.email ?? null, phone: d.phone ?? null, createdAt: d.createdAt };
}

/** Only these fields may be changed by the customer; email/phone/role/createdAt are never client-settable here. */
export async function updateProfileName(uid: string, fullName: string): Promise<void> {
  await col(C.users).doc(uid).set({ fullName, updatedAt: nowIso() }, { merge: true });
}
