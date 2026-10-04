import "server-only";
import { C, col, nowIso } from "./common";
import {
  DEFAULT_PRIVATE_SETTINGS,
  DEFAULT_PUBLIC_SETTINGS,
  privateSettingsSchema,
  publicSettingsSchema,
  type PrivateSettings,
  type PublicSettings,
} from "@/domain/settings";
import { cachedFn, invalidate } from "../cache";

function deepMerge<T>(base: T, over: unknown): T {
  if (over === null || typeof over !== "object" || Array.isArray(over) || typeof base !== "object" || base === null || Array.isArray(base)) {
    return (over === undefined ? base : (over as T)) as T;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    out[k] = k in out ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

async function readPublic(): Promise<PublicSettings> {
  const snap = await col(C.settings).doc("public").get();
  const merged = deepMerge(DEFAULT_PUBLIC_SETTINGS, snap.exists ? snap.data() : {});
  const parsed = publicSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_PUBLIC_SETTINGS;
}

export const getPublicSettings = cachedFn(readPublic, ["settings-public"], ["settings"]);

/** Uncached read for admin editing and transactional checks. */
export const getPublicSettingsFresh = readPublic;

export async function getPrivateSettings(): Promise<PrivateSettings> {
  const snap = await col(C.settings).doc("private").get();
  const parsed = privateSettingsSchema.safeParse(deepMerge(DEFAULT_PRIVATE_SETTINGS, snap.exists ? snap.data() : {}));
  return parsed.success ? parsed.data : DEFAULT_PRIVATE_SETTINGS;
}

export async function savePublicSettings(next: PublicSettings, actor: string): Promise<void> {
  const valid = publicSettingsSchema.parse(next);
  await col(C.settings).doc("public").set({ ...valid, updatedAt: nowIso(), updatedBy: actor });
  invalidate("settings");
}

export async function savePrivateSettings(next: PrivateSettings, actor: string): Promise<void> {
  const valid = privateSettingsSchema.parse(next);
  await col(C.settings).doc("private").set({ ...valid, updatedAt: nowIso(), updatedBy: actor });
}
