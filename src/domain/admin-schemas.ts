import { z } from "zod";

/** Admin-side input schemas (shared by the editor UI for instant feedback and by the server, which is authoritative). */

const money = z.number().int().min(1, "Must be greater than zero").max(100_000_000_00); // paise, up to Rs 10 crore
const sku = z
  .string()
  .trim()
  .toUpperCase()
  .min(3, "SKU is too short")
  .max(40)
  .regex(/^[A-Z0-9][A-Z0-9._-]*$/, "Use letters, numbers, dots, dashes or underscores");

export const variantInputSchema = z.object({
  id: z.string().max(120).optional(),
  size: z.string().trim().min(1, "Size is required").max(20),
  color: z.string().trim().min(1, "Colour is required").max(30),
  sku,
  /** Initial stock for NEW variants only. Existing stock is changed in Inventory (version-checked). */
  stock: z.number().int().min(0).max(100_000).default(0),
  lowStockThreshold: z.number().int().min(0).max(1000).default(3),
  priceOverride: money.nullable().default(null),
});
export type VariantInput = z.infer<typeof variantInputSchema>;

export const imageInputSchema = z.object({
  src: z.string().min(1).max(300).regex(/^(\/demo\/[\w./-]+|products\/(draft|published)\/[\w./-]+)$/, "Invalid image path"),
  alt: z.string().trim().min(3, "Describe the image for screen readers").max(200),
  order: z.number().int().min(0).max(50),
});

export const productInputSchema = z
  .object({
    name: z.string().trim().min(3, "Name is required").max(120),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(3)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, numbers and single hyphens only"),
    categoryId: z.string().min(1, "Choose a category").max(60),
    description: z.string().trim().min(10, "Add a description").max(5000),
    details: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
    price: money,
    compareAtPrice: money.nullable().default(null),
    fabric: z.string().trim().max(120).default(""),
    workType: z.string().trim().max(120).default(""),
    setIncludes: z.string().trim().max(200).default(""),
    weightGrams: z.number().int().min(0).max(20_000).default(0),
    isCustomizable: z.boolean().default(false),
    enquiryOnly: z.boolean().default(false),
    leadTimeDays: z.number().int().min(1).max(365).nullable().default(null),
    isFeatured: z.boolean().default(false),
    isBestSeller: z.boolean().default(false),
    isNewArrival: z.boolean().default(false),
    status: z.enum(["draft", "published", "archived"]),
    images: z.array(imageInputSchema).max(12).default([]),
    tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(20).default([]),
    seo: z.object({ title: z.string().trim().max(70).default(""), description: z.string().trim().max(170).default("") }).default({ title: "", description: "" }),
    variants: z.array(variantInputSchema).min(1, "Add at least one size/colour variant").max(60),
    expectedVersion: z.number().int().min(1).optional(),
  })
  .superRefine((p, ctx) => {
    if (p.compareAtPrice != null && p.compareAtPrice <= p.price) ctx.addIssue({ code: "custom", path: ["compareAtPrice"], message: "Compare-at price must be higher than the selling price (leave empty for no markdown)" });
    if (p.enquiryOnly && !p.isCustomizable) ctx.addIssue({ code: "custom", path: ["enquiryOnly"], message: "Made-to-measure (enquiry only) pieces must be marked customisable" });
    if (p.isCustomizable && p.leadTimeDays == null) ctx.addIssue({ code: "custom", path: ["leadTimeDays"], message: "Add a production lead time in days" });
    if (p.status === "published" && p.images.length === 0) ctx.addIssue({ code: "custom", path: ["images"], message: "Add at least one image before publishing" });
    const seen = new Set<string>();
    const seenSku = new Set<string>();
    p.variants.forEach((v, i) => {
      const k = `${v.size.toLowerCase()}|${v.color.toLowerCase()}`;
      if (seen.has(k)) ctx.addIssue({ code: "custom", path: ["variants", i, "size"], message: "Duplicate size and colour combination" });
      seen.add(k);
      if (seenSku.has(v.sku)) ctx.addIssue({ code: "custom", path: ["variants", i, "sku"], message: "Duplicate SKU in this product" });
      seenSku.add(v.sku);
    });
  });
export type ProductInput = z.infer<typeof productInputSchema>;

export const categoryInputSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(60),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, numbers and single hyphens only"),
  description: z.string().trim().max(500).default(""),
  imageUrl: z
    .string()
    .max(300)
    .regex(/^(\/demo\/[\w./-]+|categories\/[\w./-]+)$/, "Invalid image path")
    .nullable()
    .default(null),
  sortOrder: z.number().int().min(0).max(1000).default(100),
  isActive: z.boolean().default(true),
  expectedVersion: z.number().int().min(1).optional(),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;
