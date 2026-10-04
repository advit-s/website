import { handle, json, clientIp, badRequest } from "@/server/http";
import { rateLimit, RULES } from "@/server/rate-limit";
import { getPublicSettings } from "@/server/repos/settings";
import { checkPincode } from "@/domain/pincode";

/** Public pincode serviceability + delivery estimate. Source: store settings (live Shiprocket lookup is added in live mode). */
export const GET = handle(async (req) => {
  await rateLimit(RULES.pincodeIp, clientIp(req));
  const pin = new URL(req.url).searchParams.get("pin") ?? "";
  if (pin.length > 10) throw badRequest("Invalid pincode.");
  const s = await getPublicSettings();
  return json(checkPincode(pin, s.delivery, s.cod.enabled));
});
