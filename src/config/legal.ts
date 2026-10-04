import type { PublicSettings } from "@/domain/settings";
import { formatINR } from "@/domain/money";

/**
 * Policy text is generated from ONE place so legal pages, FAQ, checkout and product tabs never disagree.
 * The wording follows the PDF drafts (RajRaani_05 sections 08-11) and is a DRAFT - it must be reviewed by a
 * professional before launch. Owner-supplied facts that are still missing render as visible markers and are
 * collected in `unresolved` (surfaced in Admin > Settings and docs/OWNER_SETUP.md). Nothing is invented.
 */
export interface DocSection {
  id: string;
  title: string;
  paragraphs: string[];
}
export interface LegalDoc {
  slug: "terms" | "privacy" | "shipping-policy" | "refund-policy";
  title: string;
  intro: string;
  sections: DocSection[];
  unresolved: string[];
}

const MISSING = (what: string) => `[${what} - to be provided by the owner]`;

function pick(val: string | null | undefined, label: string, unresolved: string[]): string {
  if (val && val.trim()) return val.trim();
  if (!unresolved.includes(label)) unresolved.push(label);
  return MISSING(label);
}

const dateLabel = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function who(s: PublicSettings, unresolved: string[]) {
  return {
    legalName: pick(s.policy.legalName, "Business legal name", unresolved),
    address: pick(s.policy.registeredAddress, "Registered business address", unresolved),
    gstin: s.policy.gstin?.trim() || "not applicable / not yet provided",
    email: pick(s.store.supportEmail, "Support email", unresolved),
    phone: pick(s.store.phone, "Support phone", unresolved),
    city: pick(s.policy.jurisdictionCity, "Jurisdiction city and state", unresolved),
    domain: process.env.NEXT_PUBLIC_SITE_URL ?? "this website",
  };
}

export function termsDoc(s: PublicSettings): LegalDoc {
  const u: string[] = [];
  const w = who(s, u);
  return {
    slug: "terms",
    title: "Terms & Conditions",
    intro: `Last updated: ${dateLabel(s.policy.lastUpdated)}. These Terms govern all purchases made on ${w.domain}, operated by ${w.legalName}, registered at ${w.address}, GSTIN ${w.gstin}.`,
    unresolved: u,
    sections: [
      { id: "general", title: "1. General", paragraphs: ["By using this website you agree to these Terms. We may update them; the date above shows the latest version."] },
      { id: "orders", title: "2. Orders", paragraphs: ["Placing an order is an offer to buy. A contract is formed only once we confirm the order (by email, WhatsApp, or on-screen confirmation) and, for prepaid orders, payment is captured."] },
      { id: "products", title: "3. Product representation", paragraphs: ["Photography is a close representation of each piece. Because many pieces are hand-embroidered, minor variation in colour, sheen, or embellishment placement between the photograph and the delivered item is normal and not a defect."] },
      { id: "pricing", title: "4. Pricing and payments", paragraphs: ["All prices are in Indian Rupees and inclusive of applicable GST unless stated otherwise. We may correct a genuine pricing error before an order is confirmed; if it is discovered after confirmation, we will contact you with the option to proceed at the correct price or cancel for a full refund.", "Prepaid payments are processed by Razorpay. We never receive or store your card, UPI PIN or bank details. Cash on delivery is available only where shown at checkout."] },
      { id: "custom", title: "5. Custom and made-to-order pieces", paragraphs: ["Orders marked Custom or Made-to-Measure are produced to the measurements and specifications agreed with you, at a price and lead time quoted by us before production starts. They are non-cancellable once production begins, except as described in the Cancellation & Refund Policy."] },
      { id: "accounts", title: "6. Accounts", paragraphs: ["You are responsible for keeping your sign-in details confidential and for activity under your account. We may suspend accounts used for fraud or abuse."] },
      { id: "ip", title: "7. Intellectual property", paragraphs: [`All product photography, descriptions and site content belong to ${w.legalName} and may not be reproduced without written permission.`] },
      { id: "liability", title: "8. Limitation of liability", paragraphs: ["Our liability for any order is limited to the value of that order. We are not liable for delays caused by the courier, force majeure, or incorrect delivery details supplied by the customer. Nothing in these Terms limits liability that cannot be limited by law."] },
      { id: "law", title: "9. Governing law", paragraphs: [`These Terms are governed by the laws of India, with courts in ${w.city} having exclusive jurisdiction.`] },
      { id: "contact", title: "10. Contact", paragraphs: [`Questions about these Terms: ${w.email} · ${w.phone}.`] },
    ],
  };
}

export function privacyDoc(s: PublicSettings): LegalDoc {
  const u: string[] = [];
  const g = s.policy.grievanceOfficer;
  const officer = g
    ? `${g.name} · ${g.email} · ${g.address} · ${g.phone}`
    : (u.push("Grievance officer (name, email, postal address, phone)"), MISSING("Grievance officer name, email, postal address and phone"));
  return {
    slug: "privacy",
    title: "Privacy Policy",
    intro: `Last updated: ${dateLabel(s.policy.lastUpdated)}. This Policy explains what personal data we collect, why, and the rights you have over it under India's Digital Personal Data Protection Act, 2023.`,
    unresolved: u,
    sections: [
      { id: "collect", title: "What we collect", paragraphs: ["Name, phone number, email and delivery address, to fulfil an order.", "Payment metadata (transaction ID, payment status) from Razorpay. We never receive or store your card, UPI PIN, or full bank details.", "Account credentials, which are handled entirely by Firebase Authentication.", "Messages you send to the AI shopping assistant, to answer your question and to improve the assistant. Please do not share sensitive personal details in the chat.", "Measurements and occasion details you submit in a custom-order enquiry, with your consent."] },
      { id: "share", title: "Who it is shared with, and why", paragraphs: ["Firebase / Google Cloud: hosts our database, authentication and file storage.", "Razorpay: processes payments. Card and bank details are handled entirely on their PCI-compliant systems, never ours.", "Shiprocket and its courier partners: receive your name, phone and address solely to deliver your order.", "Anthropic: processes messages sent to the AI shopping assistant.", "We do not sell personal data to anyone, for any reason."] },
      { id: "purpose", title: "How we use it", paragraphs: ["Phone numbers and emails collected for an order are used to deliver and support that order. We do not use them for marketing without your separate, explicit consent."] },
      { id: "cookies", title: "Cookies and local storage", paragraphs: ["We use a strictly necessary, HTTP-only session cookie to keep you signed in, and browser storage to remember your cart and wishlist if you are not signed in. We do not use advertising cookies. If we add analytics later, this section will be updated and consent requested where required."] },
      { id: "security", title: "Security", paragraphs: ["We use access controls, encrypted connections, server-side validation and limited retention to protect your data. No system is perfectly secure; if personal data is ever exposed, we will notify affected people and the Data Protection Board as the law requires."] },
      { id: "retention", title: "Retention", paragraphs: ["Order records are kept as long as required for accounting, tax and legal purposes. Assistant conversations are kept for a limited period configured by us and then deleted."] },
      { id: "rights", title: "Your rights", paragraphs: ["You may request access to, correction of, or deletion of your personal data at any time by contacting our grievance officer below. We will respond within the timeframe required by applicable law. Deleting your account does not erase order records we must keep by law."] },
      { id: "assistant", title: "AI assistant disclosure", paragraphs: ["The shopping assistant is an automated AI system. It can make mistakes, only answers from our catalogue and policies, and hands you to WhatsApp for anything it cannot answer."] },
      { id: "grievance", title: "Grievance officer", paragraphs: [officer] },
    ],
  };
}

export function shippingDoc(s: PublicSettings): LegalDoc {
  const d = s.delivery;
  return {
    slug: "shipping-policy",
    title: "Shipping & Delivery Policy",
    intro: "We currently ship within India exclusively. We do not offer international delivery at this time.",
    unresolved: [],
    sections: [
      { id: "ncr", title: "Delhi NCR", paragraphs: [`Most in-stock orders are estimated to be delivered in ${d.ncrDays[0]}–${d.ncrDays[1]} days via our hyperlocal courier partner.`] },
      { id: "rest", title: "Rest of India", paragraphs: [`In-stock orders are estimated to be delivered in ${d.restDays[0]}–${d.restDays[1]} business days, depending on the destination pincode and the courier assigned.`] },
      { id: "custom", title: "Custom and made-to-order pieces", paragraphs: ["These ship only once production is complete, per the lead time stated on the product page. This is in addition to, not instead of, the delivery time above."] },
      { id: "charges", title: "Delivery charges", paragraphs: [`Delivery charges are shown at checkout before payment and are waived on orders of ${formatINR(d.freeShippingThreshold)} or more (after discounts).`, `Heavy or bulky pieces (most bridal lehengas) carry a freight surcharge of ${formatINR(d.heavySurchargePerKg)} per started kilogram above ${d.heavyAboveGrams / 1000} kg, also shown at checkout and never added afterwards. The surcharge is waived together with delivery charges above the free-delivery threshold.`] },
      { id: "cod", title: "Cash on delivery", paragraphs: s.cod.enabled ? [`Cash on delivery is available on eligible pincodes for orders up to ${formatINR(s.cod.maxOrderValue)}${s.cod.fee ? `, with a handling fee of ${formatINR(s.cod.fee)}` : ""}. It is not available for made-to-measure orders.`] : ["Cash on delivery is not currently offered."] },
      { id: "tracking", title: "Tracking and delays", paragraphs: ["A tracking link is provided by SMS/WhatsApp and on the order page once an order is dispatched. Delivery estimates are our best expectation, not a guarantee, and can be affected by courier delays, weather or circumstances outside our control.", "If a parcel arrives damaged, please follow the damage-reporting steps in our Cancellation & Refund Policy."] },
    ],
  };
}

export function refundDoc(s: PublicSettings): LegalDoc {
  const p = s.policy;
  const u: string[] = [];
  const email = pick(s.store.supportEmail, "Support email", u);
  return {
    slug: "refund-policy",
    title: "Cancellation, Return & Refund Policy",
    intro: "How cancellations, returns, exchanges and refunds work for ready-to-ship and made-to-measure pieces.",
    unresolved: u,
    sections: [
      { id: "cancel", title: "1. Cancellation window", paragraphs: ["An order for a ready-to-ship item can be cancelled free of charge any time before it is marked Shipped. A custom or made-to-order piece can be cancelled only before production begins; once production starts, the advance payment is non-refundable."] },
      { id: "returns", title: "2. Returns", paragraphs: [`Ready-to-ship items may be returned within ${p.returnWindowDays} days of delivery if unused, unaltered, and with tags intact. Custom and made-to-measure pieces are not eligible for return, as they are produced specifically to the customer's order; this is stated on the product page before purchase.`] },
      { id: "damaged", title: "3. Damaged or incorrect items", paragraphs: [`Report a damaged, defective or incorrect item within ${p.damageReportHours} hours of delivery, with photographs, to ${email} or on WhatsApp. We cover return shipping in this case and offer a replacement or full refund.`] },
      { id: "refund", title: "4. Refund method and timeline", paragraphs: [`Approved refunds are issued to the original payment method within ${p.refundBusinessDaysMin}–${p.refundBusinessDaysMax} business days of the returned item passing inspection. Cash on delivery refunds are processed via bank transfer or UPI.`] },
      { id: "exchange", title: "5. Exchanges", paragraphs: ["A size or colour exchange, where stock allows, follows the same window and condition as a standard return."] },
      { id: "nonreturnable", title: "6. Non-returnable items", paragraphs: ["Made-to-measure pieces, accessories marked final sale, and items that have been worn, washed, altered or are missing tags are not eligible for return."] },
    ],
  };
}

export const LEGAL_DOCS = { terms: termsDoc, privacy: privacyDoc, "shipping-policy": shippingDoc, "refund-policy": refundDoc } as const;

/** All unresolved owner-provided legal details across documents (for admin checklist). */
export function allUnresolved(s: PublicSettings): string[] {
  return Array.from(new Set([termsDoc(s), privacyDoc(s), shippingDoc(s), refundDoc(s)].flatMap((d) => d.unresolved)));
}
