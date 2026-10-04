import { assertSameOrigin, clientIp, handle, json, readJson } from "@/server/http";
import { rateLimit, RULES } from "@/server/rate-limit";
import { customEnquirySchema } from "@/domain/validation";
import { createCustomEnquiry } from "@/server/services/enquiries";

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  await rateLimit(RULES.customEnquiryIp, clientIp(req));
  const input = await readJson(req, customEnquirySchema);
  if (input.website) return json({ ok: true, reference: "ENQ-000000", whatsappUrl: "/contact" }); // honeypot: pretend success, store nothing
  const res = await createCustomEnquiry(input);
  return json({ ok: true, ...res });
});
