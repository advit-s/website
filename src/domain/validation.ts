import { z } from "zod";

/** Shared (client + server) validation primitives. The server always re-validates; client use is for UX only. */

export const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
  "Uttarakhand", "West Bengal",
] as const;

const clean = (max: number) => z.string().trim().max(max);

/** Indian mobile: 10 digits starting 6-9, with optional +91 / 0 prefix. Normalised to +91XXXXXXXXXX. */
export function normalizeIndianPhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-()]/g, "");
  const m = digits.match(/^(?:\+91|91|0)?([6-9]\d{9})$/);
  return m ? `+91${m[1]}` : null;
}

export const phoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizeIndianPhone(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "Enter a valid 10-digit Indian mobile number." });
      return z.NEVER;
    }
    return n;
  });

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.").max(120);

export const pincodeSchema = z.string().trim().regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit pincode.");

export const addressSchema = z.object({
  fullName: clean(80).min(2, "Enter the recipient's full name."),
  phone: phoneSchema,
  line1: clean(120).min(5, "Enter house number and street."),
  line2: clean(120).default(""),
  landmark: clean(80).optional(),
  city: clean(60).min(2, "Enter the city."),
  state: z.enum(INDIAN_STATES, { error: "Select a state." }),
  pincode: pincodeSchema,
  country: z.literal("IN").default("IN"),
});
export type AddressInput = z.infer<typeof addressSchema>;

export const savedAddressSchema = addressSchema.extend({
  label: clean(30).min(1, "Give this address a label.").default("Home"),
  isDefault: z.boolean().default(false),
});

/** Firebase Auth password policy mirrored for the UI: 8+ chars with upper, lower and a digit. */
export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(128)
  .regex(/[a-z]/, "Include a lowercase letter.")
  .regex(/[A-Z]/, "Include an uppercase letter.")
  .regex(/\d/, "Include a number.");

export const cartLineSchema = z.object({ variantId: z.string().min(1).max(120), quantity: z.number().int().min(1).max(10) });
export const cartLinesSchema = z.array(cartLineSchema).max(50);

export const checkoutSchema = z.object({
  lines: cartLinesSchema.min(1, "Your cart is empty."),
  contact: z.object({ name: clean(80).min(2), email: emailSchema, phone: phoneSchema }),
  address: addressSchema,
  paymentMethod: z.enum(["razorpay", "cod"]),
  couponCode: z.string().trim().toUpperCase().max(30).optional(),
  /** Saved address id is informational only; the address body above is what gets snapshotted. */
  saveAddress: z.boolean().optional(),
  /** Honeypot - must be empty. */
  website: z.string().max(0).optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const contactSchema = z.object({
  name: clean(80).min(2, "Please tell us your name."),
  email: emailSchema,
  phone: phoneSchema.optional().or(z.literal("").transform(() => undefined)),
  message: clean(2000).min(10, "Please write at least a sentence."),
  website: z.string().max(0).optional(), // honeypot
});

const cm = z.number().min(20, "Looks too small").max(250, "Looks too large");
export const customEnquirySchema = z.object({
  productId: z.string().min(1).max(60),
  name: clean(80).min(2, "Please tell us your name."),
  phone: phoneSchema,
  email: emailSchema.optional().or(z.literal("").transform(() => undefined)),
  occasion: clean(80).min(2, "What is the occasion?"),
  occasionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the occasion date."),
  measurements: z
    .object({ bust: cm.optional(), waist: cm.optional(), hip: cm.optional(), blouseLength: cm.optional(), lehengaLength: cm.optional() })
    .default({}),
  notes: clean(600).optional(),
  consent: z.literal(true, { error: "Please confirm you agree to be contacted about this enquiry." }),
  website: z.string().max(0).optional(),
});
export type CustomEnquiryInput = z.infer<typeof customEnquirySchema>;

export const trackOrderSchema = z.object({
  orderNumber: z.string().trim().toUpperCase().regex(/^RRC-\d{4,8}$/, "Order numbers look like RRC-1042."),
  contact: clean(120).min(5, "Enter the phone number or email used for the order."),
});
