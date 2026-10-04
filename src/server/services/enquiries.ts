import "server-only";
import { C, col, newId, nowIso } from "../repos/common";
import { getPublicSettings } from "../repos/settings";
import { whatsappHref } from "@/lib/whatsapp";
import type { CustomEnquiryInput } from "@/domain/validation";
import { notFound, badRequest } from "../http";
import { fromDoc } from "../repos/catalog";
import type { Product } from "@/domain/types";
import { enqueueNotification } from "./notifications";

export async function createContactEnquiry(input: { name: string; email: string; phone?: string; message: string }): Promise<{ id: string }> {
  const id = newId("ctc_");
  await col(C.contactEnquiries).doc(id).set({
    name: input.name,
    email: input.email,
    phone: input.phone ?? null,
    message: input.message.slice(0, 2000),
    status: "new",
    createdAt: nowIso(),
  });
  await enqueueNotification({ kind: "admin.contact_enquiry", to: { admin: true }, data: { enquiryId: id, name: input.name } });
  return { id };
}

/**
 * Persist a custom / made-to-measure enquiry. The enquiry is NOT an order and nothing is charged.
 * Returns an encoded WhatsApp draft link; the visitor reviews and sends it themselves (nothing is auto-sent).
 */
export async function createCustomEnquiry(input: CustomEnquiryInput): Promise<{ id: string; reference: string; whatsappUrl: string }> {
  const snap = await col(C.products).doc(input.productId).get();
  if (!snap.exists) throw notFound("Product not found.");
  const p = fromDoc<Product>(snap);
  if (p.status !== "published") throw notFound("Product not found.");
  if (!p.isCustomizable) throw badRequest("This piece is not available as a custom order.");

  const today = new Date().toISOString().slice(0, 10);
  if (input.occasionDate < today) throw badRequest("The occasion date must be in the future.");

  const id = newId("cus_");
  const reference = `ENQ-${id.slice(4, 10).toUpperCase()}`;
  const m = input.measurements;
  await col(C.customEnquiries).doc(id).set({
    reference,
    productId: p.id,
    productName: p.name,
    productPriceIndicative: p.price,
    name: input.name,
    phone: input.phone,
    email: input.email ?? null,
    occasion: input.occasion,
    occasionDate: input.occasionDate,
    measurements: m,
    notes: input.notes ?? null,
    consentAt: nowIso(),
    status: "new", // new -> quoted -> accepted -> in_production -> ready | declined
    quote: null,
    createdAt: nowIso(),
  });

  const settings = await getPublicSettings();
  const lines = [
    `Hello Raj Raani Collections, I would like to enquire about: ${p.name} (ref ${reference}).`,
    `Occasion: ${input.occasion} on ${input.occasionDate}.`,
    Object.values(m).some((v) => v != null)
      ? `Measurements (cm): ${[m.bust && `bust ${m.bust}`, m.waist && `waist ${m.waist}`, m.hip && `hip ${m.hip}`, m.blouseLength && `blouse length ${m.blouseLength}`, m.lehengaLength && `lehenga length ${m.lehengaLength}`].filter(Boolean).join(", ")}.`
      : "I will share measurements on chat.",
    input.notes ? `Notes: ${input.notes}` : "",
    `Name: ${input.name}`,
  ].filter(Boolean);
  await enqueueNotification({ kind: "admin.custom_enquiry", to: { admin: true }, data: { enquiryId: id, reference, product: p.name } });
  return { id, reference, whatsappUrl: whatsappHref(settings.store.whatsappNumber, lines.join("\n")) };
}
