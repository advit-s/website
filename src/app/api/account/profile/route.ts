import { z } from "zod";
import { assertSameOrigin, handle, json, readJson } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { getProfile, updateProfileName } from "@/server/repos/users";

const body = z.object({ fullName: z.string().trim().min(2, "Enter your full name.").max(80) });

/** Only `fullName` is editable. Role, email-of-record and phone-of-record cannot be set through this endpoint. */
export const PATCH = handle(async (req) => {
  assertSameOrigin(req);
  const u = await requireUser();
  const { fullName } = await readJson(req, body);
  await updateProfileName(u.uid, fullName);
  return json({ profile: await getProfile(u.uid) });
});
