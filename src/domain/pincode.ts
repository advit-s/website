import type { PublicSettings } from "./settings";

export type Zone = "ncr" | "rest";

/** 3-digit PIN prefixes treated as Delhi NCR (Delhi, Gurugram, Faridabad, Noida/Ghaziabad). Owner-reviewable draft list. */
const NCR_PREFIXES = new Set(["110", "121", "122", "201"]);

export const isValidPincodeFormat = (p: string): boolean => /^[1-9]\d{5}$/.test(p);

export type PincodeCheck =
  | { ok: false; reason: "invalid" | "unserviceable"; message: string }
  | { ok: true; zone: Zone; codAllowed: boolean; estimateText: string; minDays: number; maxDays: number };

export function checkPincode(pincode: string, delivery: PublicSettings["delivery"], codEnabled: boolean): PincodeCheck {
  const p = pincode.trim();
  if (!isValidPincodeFormat(p)) return { ok: false, reason: "invalid", message: "Enter a valid 6-digit Indian pincode." };
  if (delivery.unserviceablePincodes.includes(p)) {
    return { ok: false, reason: "unserviceable", message: "We cannot deliver to this pincode yet. Message us on WhatsApp for options." };
  }
  const zone: Zone = NCR_PREFIXES.has(p.slice(0, 3)) ? "ncr" : "rest";
  const [minDays, maxDays] = zone === "ncr" ? delivery.ncrDays : delivery.restDays;
  const unit = zone === "ncr" ? "days" : "business days";
  return {
    ok: true,
    zone,
    codAllowed: codEnabled && !delivery.codBlockedPincodes.includes(p),
    minDays,
    maxDays,
    estimateText: `Estimated delivery in ${minDays}–${maxDays} ${unit} for in-stock pieces (an estimate, not a guarantee)`,
  };
}
