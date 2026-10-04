import "server-only";
import { C, col, newId, nowIso } from "./common";
import { db } from "../firebase/admin";
import { conflict, notFound } from "../http";
import type { SavedAddress } from "@/domain/types";
import type { z } from "zod";
import type { savedAddressSchema } from "@/domain/validation";

type AddressInput = z.infer<typeof savedAddressSchema>;
const MAX_ADDRESSES = 10;
const addrCol = (uid: string) => col(C.users).doc(uid).collection("addresses");

export async function listAddresses(uid: string): Promise<SavedAddress[]> {
  const snap = await addrCol(uid).orderBy("createdAt", "desc").limit(MAX_ADDRESSES + 5).get();
  const all = snap.docs.map((d) => ({ ...(d.data() as Omit<SavedAddress, "id">), id: d.id }));
  return all.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

/** Create or update an address. Default-address changes happen in the same transaction so there is never zero-or-two defaults. */
export async function saveAddress(uid: string, input: AddressInput, id?: string): Promise<SavedAddress> {
  const now = nowIso();
  const addrId = id ?? newId("addr_");
  await db().runTransaction(async (tx) => {
    const existing = await tx.get(addrCol(uid));
    const docs = existing.docs;
    if (!id && docs.length >= MAX_ADDRESSES) throw conflict("ADDRESS_LIMIT", `You can save up to ${MAX_ADDRESSES} addresses. Remove one first.`);
    const current = id ? docs.find((d) => d.id === id) : undefined;
    if (id && !current) throw notFound("Address not found.");
    const makeDefault = input.isDefault || docs.length === 0 || (docs.length === 1 && !!current);
    if (makeDefault) {
      for (const d of docs) if (d.id !== addrId && (d.data() as { isDefault: boolean }).isDefault) tx.update(d.ref, { isDefault: false, updatedAt: now });
    }
    const wasDefault = current ? (current.data() as { isDefault: boolean }).isDefault : false;
    tx.set(addrCol(uid).doc(addrId), {
      ...input,
      isDefault: makeDefault || wasDefault,
      createdAt: current ? (current.data() as { createdAt: string }).createdAt : now,
      updatedAt: now,
    });
  });
  const snap = await addrCol(uid).doc(addrId).get();
  return { ...(snap.data() as Omit<SavedAddress, "id">), id: addrId };
}

export async function deleteAddress(uid: string, id: string): Promise<void> {
  await db().runTransaction(async (tx) => {
    const all = await tx.get(addrCol(uid));
    const target = all.docs.find((d) => d.id === id);
    if (!target) throw notFound("Address not found.");
    tx.delete(target.ref);
    // If the default was removed, promote the most recent remaining address.
    if ((target.data() as { isDefault: boolean }).isDefault) {
      const next = all.docs.filter((d) => d.id !== id).sort((a, b) => (b.data() as { createdAt: string }).createdAt.localeCompare((a.data() as { createdAt: string }).createdAt))[0];
      if (next) tx.update(next.ref, { isDefault: true, updatedAt: nowIso() });
    }
  });
}

export async function setDefaultAddress(uid: string, id: string): Promise<void> {
  await db().runTransaction(async (tx) => {
    const all = await tx.get(addrCol(uid));
    if (!all.docs.some((d) => d.id === id)) throw notFound("Address not found.");
    const now = nowIso();
    for (const d of all.docs) {
      const isDef = d.id === id;
      if ((d.data() as { isDefault: boolean }).isDefault !== isDef) tx.update(d.ref, { isDefault: isDef, updatedAt: now });
    }
  });
}
