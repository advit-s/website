import { z } from "zod";
import { assertSameOrigin, handle, json, readJson } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { deleteAddress, listAddresses, saveAddress, setDefaultAddress } from "@/server/repos/addresses";
import { savedAddressSchema } from "@/domain/validation";

export const GET = handle(async () => {
  const u = await requireUser();
  return json({ addresses: await listAddresses(u.uid) });
});

/** Create (no id) or update (id) an address belonging to the signed-in user. Old orders keep their own address snapshot. */
const upsert = savedAddressSchema.extend({ id: z.string().min(1).max(40).optional() });
export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const u = await requireUser();
  const { id, ...input } = await readJson(req, upsert);
  await saveAddress(u.uid, input, id);
  return json({ addresses: await listAddresses(u.uid) });
});

const patch = z.object({ id: z.string().min(1).max(40), action: z.literal("default") });
export const PATCH = handle(async (req) => {
  assertSameOrigin(req);
  const u = await requireUser();
  const { id } = await readJson(req, patch);
  await setDefaultAddress(u.uid, id);
  return json({ addresses: await listAddresses(u.uid) });
});

const del = z.object({ id: z.string().min(1).max(40) });
export const DELETE = handle(async (req) => {
  assertSameOrigin(req);
  const u = await requireUser();
  const { id } = await readJson(req, del);
  await deleteAddress(u.uid, id);
  return json({ addresses: await listAddresses(u.uid) });
});
