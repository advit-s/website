import { assertSameOrigin, clientIp, handle, json, readJson } from "@/server/http";
import { rateLimit, RULES } from "@/server/rate-limit";
import { contactSchema } from "@/domain/validation";
import { createContactEnquiry } from "@/server/services/enquiries";

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  await rateLimit(RULES.contactIp, clientIp(req));
  const input = await readJson(req, contactSchema);
  if (input.website) return json({ ok: true }); // honeypot tripped: look successful, store nothing
  await createContactEnquiry({ name: input.name, email: input.email, phone: input.phone, message: input.message });
  return json({ ok: true });
});
