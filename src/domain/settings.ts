import { z } from "zod";

/**
 * Publicly readable store settings (document settings/public). Contains NO secrets.
 * Every value that the owner must supply is either null/empty or marked as a demo default.
 */
export const publicSettingsSchema = z.object({
  store: z.object({
    name: z.string().min(1).max(80),
    tagline: z.string().max(160),
    supportEmail: z.string().email().max(120).nullable(),
    phone: z.string().max(20).nullable(),
    /** Digits only with country code, e.g. 919876543210. Null until owner supplies it. */
    whatsappNumber: z.string().regex(/^\d{10,15}$/).nullable(),
    addressLines: z.array(z.string().max(120)).max(5),
    hours: z.string().max(120).nullable(),
  }),
  announcement: z.object({
    enabled: z.boolean(),
    text: z.string().max(160),
    href: z.string().max(200).nullable(),
  }),
  hero: z.object({
    eyebrow: z.string().max(60),
    headline: z.string().max(80),
    subhead: z.string().max(200),
    ctaLabel: z.string().max(40),
    ctaHref: z.string().max(200),
    imageAlt: z.string().max(200),
  }),
  home: z.object({
    featuredProductIds: z.array(z.string()).max(12),
    showBestsellers: z.boolean(),
    storyHeading: z.string().max(80),
    storyBody: z.string().max(600),
    customHeading: z.string().max(80),
    customBody: z.string().max(400),
  }),
  social: z.object({
    instagram: z.string().url().nullable(),
    facebook: z.string().url().nullable(),
    youtube: z.string().url().nullable(),
    pinterest: z.string().url().nullable(),
  }),
  delivery: z.object({
    /** Orders at or above this subtotal ship free (paise). */
    freeShippingThreshold: z.number().int().nonnegative(),
    ncrFlatRate: z.number().int().nonnegative(),
    restOfIndiaFlatRate: z.number().int().nonnegative(),
    /** Heavy-piece surcharge per started 1000 g above `heavyAboveGrams`. */
    heavyAboveGrams: z.number().int().nonnegative(),
    heavySurchargePerKg: z.number().int().nonnegative(),
    ncrDays: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    restDays: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    unserviceablePincodes: z.array(z.string().regex(/^\d{6}$/)).max(5000),
    codBlockedPincodes: z.array(z.string().regex(/^\d{6}$/)).max(5000),
  }),
  cod: z.object({
    enabled: z.boolean(),
    maxOrderValue: z.number().int().nonnegative(),
    fee: z.number().int().nonnegative(),
  }),
  checkout: z.object({
    reservationMinutes: z.number().int().min(5).max(60),
    maxPaymentAttempts: z.number().int().min(1).max(6),
    maxQuantityPerLine: z.number().int().min(1).max(10),
  }),
  /** Admin-editable subset of policy numbers; text in legal pages is rendered from these. */
  policy: z.object({
    returnWindowDays: z.number().int().min(0).max(60),
    damageReportHours: z.number().int().min(1).max(240),
    refundBusinessDaysMin: z.number().int().min(1).max(30),
    refundBusinessDaysMax: z.number().int().min(1).max(30),
    lastUpdated: z.string(),
    /** Legal identity placeholders - all must be filled before launch. */
    legalName: z.string().max(120).nullable(),
    gstin: z.string().max(20).nullable(),
    registeredAddress: z.string().max(300).nullable(),
    jurisdictionCity: z.string().max(80).nullable(),
    grievanceOfficer: z
      .object({ name: z.string().max(80), email: z.string().max(120), phone: z.string().max(20), address: z.string().max(300) })
      .nullable(),
  }),
});
export type PublicSettings = z.infer<typeof publicSettingsSchema>;

export const privateSettingsSchema = z.object({
  notifications: z.object({
    orderAlertEmail: z.string().email().nullable(),
    channel: z.enum(["preview", "email", "sms", "whatsapp"]),
  }),
  assistant: z.object({
    customerEnabled: z.boolean(),
    retentionDays: z.number().int().min(1).max(730),
    dailyMessageCap: z.number().int().min(10).max(100000),
  }),
});
export type PrivateSettings = z.infer<typeof privateSettingsSchema>;

/** Demo defaults used by seed and as a fallback when settings docs do not exist yet. Owner must review. */
export const DEFAULT_PUBLIC_SETTINGS: PublicSettings = {
  store: {
    name: "Raj Raani Collections",
    tagline: "Indian lehengas and occasionwear",
    supportEmail: null,
    phone: null,
    whatsappNumber: null,
    addressLines: [],
    hours: null,
  },
  announcement: { enabled: true, text: "Demo store - sample catalogue and simulated checkout", href: null },
  hero: {
    eyebrow: "Raj Raani Couture",
    headline: "Timeless Indian Couture",
    subhead: "For life's most beautiful moments",
    ctaLabel: "Shop the collection",
    ctaHref: "/shop",
    imageAlt: "Illustration of a maroon bridal lehenga with gold embroidery",
  },
  home: {
    featuredProductIds: [],
    showBestsellers: true,
    storyHeading: "The Art of Indian Couture",
    storyBody:
      "Each Raj Raani piece begins with a silhouette drawn for the Indian occasion and is finished with embroidery worked by hand. Replace this paragraph with the founder's own words in Admin > Settings.",
    customHeading: "Made to your measure",
    customBody: "Planning a wedding or a milestone celebration? Share your measurements and occasion date and we will talk through fit, finish and lead time on WhatsApp before anything is charged.",
  },
  social: { instagram: null, facebook: null, youtube: null, pinterest: null },
  delivery: {
    freeShippingThreshold: 1_000_000, // demo: Rs 10,000
    ncrFlatRate: 9_900, // demo: Rs 99
    restOfIndiaFlatRate: 19_900, // demo: Rs 199
    heavyAboveGrams: 2_000,
    heavySurchargePerKg: 15_000, // demo: Rs 150 per started kg above 2 kg
    ncrDays: [1, 2],
    restDays: [3, 7],
    unserviceablePincodes: [],
    codBlockedPincodes: [],
  },
  cod: { enabled: true, maxOrderValue: 5_000_000, fee: 0 },
  checkout: { reservationMinutes: 15, maxPaymentAttempts: 3, maxQuantityPerLine: 5 },
  policy: {
    returnWindowDays: 7,
    damageReportHours: 48,
    refundBusinessDaysMin: 7,
    refundBusinessDaysMax: 10,
    lastUpdated: "2026-10-04",
    legalName: null,
    gstin: null,
    registeredAddress: null,
    jurisdictionCity: null,
    grievanceOfficer: null,
  },
};

export const DEFAULT_PRIVATE_SETTINGS: PrivateSettings = {
  notifications: { orderAlertEmail: null, channel: "preview" },
  assistant: { customerEnabled: true, retentionDays: 365, dailyMessageCap: 2000 },
};
