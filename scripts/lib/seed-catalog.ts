import type { GarmentPalette, AccessoryKind } from "./demo-art";

/** DEMO catalogue. Names/prices are samples (PDF examples where given); photographs do not exist - art is generated. */

export interface SeedCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
  art: { palette: GarmentPalette };
}

const P = (bg1: string, bg2: string, skirt: string, skirtDeep: string, blouse: string, dupatta: string, motif: GarmentPalette["motif"], trim = "#f1d77b"): GarmentPalette => ({
  bg1,
  bg2,
  skirt,
  skirtDeep,
  trim,
  blouse,
  dupatta,
  motif,
});

export const PALETTES = {
  maroon: P("#e9d3c6", "#c99a86", "#7a1a2e", "#4a1020", "#5a1424", "#c25b6d", "paisley"),
  crimson: P("#ecd5d0", "#cf9a96", "#b01c33", "#6b0f20", "#7e1226", "#e08a98", "floral"),
  gold: P("#f1e6cc", "#d8bd86", "#c79a3c", "#8a6416", "#a67a22", "#f6e3a8", "paisley"),
  ivory: P("#f4eee3", "#d9ccb4", "#efe5d2", "#cdbb9c", "#d9c6a2", "#faf4e6", "floral"),
  blush: P("#f5e6e6", "#dbb3b3", "#e3a9b0", "#b97580", "#c98791", "#f6d3d6", "floral"),
  emerald: P("#e3ece4", "#9bbaa3", "#1d6a50", "#0f3f31", "#16503c", "#79b79d", "dots"),
  peach: P("#f7e6da", "#e5b8a0", "#ee9a78", "#c7694a", "#d5795a", "#f9cdb7", "dots"),
  marigold: P("#f6ebce", "#e2c26a", "#e0a21f", "#a8710a", "#b98015", "#f3d98c", "lines"),
  teal: P("#dfeaea", "#90b3b4", "#1f6f77", "#0e4046", "#165760", "#7fb9bd", "paisley"),
  midnight: P("#dfe0ea", "#8f93b3", "#22285a", "#10143a", "#1a1f4a", "#6f78bf", "lines"),
  wine: P("#ead9dc", "#c39aa2", "#6b1e2d", "#3d0f19", "#4f1522", "#a5566a", "floral"),
  silver: P("#eceff1", "#b4bdc3", "#b9c2c8", "#7c878f", "#98a3aa", "#e6ecf0", "dots"),
  rani: P("#f4dfe6", "#d596ac", "#c2306c", "#7d1241", "#98215a", "#ea8db3", "paisley"),
  sage: P("#e9eede", "#aebb93", "#8da06a", "#55683a", "#6b7e4b", "#c6d3a6", "lines"),
} satisfies Record<string, GarmentPalette>;

export const SEED_CATEGORIES: SeedCategory[] = [
  { id: "cat_bridal", name: "Bridal Lehengas", slug: "bridal-lehengas", description: "Heirloom silhouettes with zari and zardozi for the bride's day.", sortOrder: 1, isActive: true, art: { palette: PALETTES.maroon } },
  { id: "cat_wedding", name: "Wedding Lehengas", slug: "wedding-lehengas", description: "Refined lehengas for wedding guests, sisters and the wider family.", sortOrder: 2, isActive: true, art: { palette: PALETTES.ivory } },
  { id: "cat_festive", name: "Festive Lehengas", slug: "festive-lehengas", description: "Colour-rich pieces for festivals, pujas and family gatherings.", sortOrder: 3, isActive: true, art: { palette: PALETTES.marigold } },
  { id: "cat_party", name: "Party Wear", slug: "party-wear", description: "Evening lehengas with sequin and mirror work.", sortOrder: 4, isActive: true, art: { palette: PALETTES.midnight } },
  { id: "cat_custom", name: "Custom Made", slug: "custom-made", description: "Made-to-measure pieces. Share your measurements and occasion date; we discuss fit, finish and lead time before anything is charged.", sortOrder: 5, isActive: true, art: { palette: PALETTES.wine } },
  { id: "cat_accessories", name: "Lehenga Accessories", slug: "lehenga-accessories", description: "Maang tikka, jhumkas, potlis and dupattas to finish the look.", sortOrder: 6, isActive: true, art: { palette: PALETTES.gold } },
];

export interface SeedProduct {
  id: string;
  slug: string;
  name: string;
  categoryId: string;
  /** rupees (converted to paise by the seeder) */
  price: number;
  compareAt?: number;
  fabric: string;
  workType: string;
  setIncludes: string;
  weightGrams: number;
  description: string;
  details: string[];
  customizable?: boolean;
  enquiryOnly?: boolean;
  leadTimeDays?: number;
  featured?: boolean;
  bestSeller?: boolean;
  newArrival?: boolean;
  tags: string[];
  skuPrefix: string;
  palette?: GarmentPalette;
  accessory?: { kind: AccessoryKind; base: string; accent: string; bg1: string; bg2: string };
  /** [size, color, stock, lowStockThreshold?, priceOverrideRupees?] */
  variants: [string, string, number, number?, number?][];
  status?: "published" | "draft";
}

const LONG = "Photography is illustrative in this demo catalogue. Hand-embroidered pieces show natural variation in sheen and embellishment placement.";

export const SEED_PRODUCTS: SeedProduct[] = [
  {
    id: "lh_royal_rose", slug: "royal-rose-bridal-lehenga", name: "Royal Rose Bridal Lehenga", categoryId: "cat_bridal",
    price: 42999, compareAt: 48999, fabric: "Silk with zari embroidery", workType: "Zari, zardozi",
    setIncludes: "Lehenga, unstitched blouse, dupatta", weightGrams: 2600, customizable: true, leadTimeDays: 21,
    featured: true, newArrival: true, tags: ["bridal", "maroon", "zari", "wedding"], skuPrefix: "RRC-BR-001", palette: PALETTES.maroon,
    description: "A deep maroon silk lehenga worked in zari and zardozi, with a full flare, scalloped borders and a net dupatta finished with gold edging.",
    details: ["Silk base with zari and zardozi embroidery", "Can-can and cotton lining for a structured flare", "Unstitched blouse piece (up to 1 m) included", "Dry clean only", LONG],
    variants: [["S", "Maroon", 2], ["M", "Maroon", 3, 3], ["L", "Maroon", 0], ["M", "Wine", 6]],
  },
  {
    id: "lh_crimson_zardozi", slug: "crimson-zardozi-bridal-lehenga", name: "Crimson Zardozi Bridal Lehenga", categoryId: "cat_bridal",
    price: 58500, fabric: "Raw silk", workType: "Heavy zardozi, sequin", setIncludes: "Lehenga, blouse piece, double dupatta", weightGrams: 3400,
    customizable: true, leadTimeDays: 28, featured: true, tags: ["bridal", "red", "zardozi"], skuPrefix: "RRC-BR-002", palette: PALETTES.crimson,
    description: "Rich crimson raw silk with dense zardozi borders and a second dupatta for the ceremonial veil drape.",
    details: ["Raw silk base", "Heavy zardozi work on border and bodice panel", "Includes veil dupatta and shoulder dupatta", LONG],
    variants: [["S", "Crimson", 4], ["M", "Crimson", 4], ["L", "Crimson", 2]],
  },
  {
    id: "lh_heritage_gold", slug: "heritage-gold-bridal-lehenga", name: "Heritage Gold Bridal Lehenga", categoryId: "cat_bridal",
    price: 64999, compareAt: 72999, fabric: "Banarasi brocade", workType: "Woven zari, kundan accents", setIncludes: "Lehenga, blouse piece, dupatta", weightGrams: 3000,
    customizable: true, leadTimeDays: 30, bestSeller: true, tags: ["bridal", "gold", "banarasi"], skuPrefix: "RRC-BR-003", palette: PALETTES.gold,
    description: "Banarasi brocade in antique gold with woven paisley panels and kundan-style highlights.",
    details: ["Banarasi brocade base", "Woven zari paisley", "Hand-finished kundan accents", LONG],
    variants: [["S", "Gold", 1, 3], ["M", "Gold", 2, 3], ["L", "Gold", 3]],
  },
  {
    id: "lh_ivory_dream", slug: "ivory-dream-wedding-lehenga", name: "Ivory Dream Wedding Lehenga", categoryId: "cat_wedding",
    price: 24999, fabric: "Organza and net", workType: "Thread, pearl", setIncludes: "Lehenga, blouse, dupatta", weightGrams: 1900,
    featured: true, bestSeller: true, tags: ["wedding", "ivory", "pastel"], skuPrefix: "RRC-WD-001", palette: PALETTES.ivory,
    description: "A soft ivory organza lehenga with tonal thread and pearl work, light enough for a long day of ceremonies.",
    details: ["Organza with net layers", "Pearl and thread embroidery", "Pre-stitched blouse in standard sizes", LONG],
    variants: [["S", "Ivory", 5], ["M", "Ivory", 5], ["L", "Ivory", 4], ["XL", "Ivory", 2, 3]],
  },
  {
    id: "lh_blush_garden", slug: "blush-garden-lehenga", name: "Blush Garden Lehenga", categoryId: "cat_wedding",
    price: 18999, compareAt: 21999, fabric: "Georgette", workType: "Floral thread, sequin", setIncludes: "Lehenga, blouse, dupatta", weightGrams: 1600,
    newArrival: true, tags: ["wedding", "blush", "floral"], skuPrefix: "RRC-WD-002", palette: PALETTES.blush,
    description: "Blush georgette with scattered floral thread work and a delicate sequin border.",
    details: ["Georgette with soft lining", "Floral thread and sequin work", LONG],
    variants: [["S", "Blush", 3, 3], ["M", "Blush", 6], ["L", "Blush", 2, 3]],
  },
  {
    id: "lh_emerald_mirror", slug: "emerald-mirror-work-lehenga", name: "Emerald Mirror Work Lehenga", categoryId: "cat_wedding",
    price: 21500, fabric: "Velvet", workType: "Mirror, gota patti", setIncludes: "Lehenga, blouse, dupatta", weightGrams: 2200,
    tags: ["wedding", "green", "mirror"], skuPrefix: "RRC-WD-003", palette: PALETTES.emerald,
    description: "Emerald velvet with mirror and gota patti detailing, suited to winter weddings.",
    details: ["Velvet base", "Mirror and gota patti work", "Dry clean only", LONG],
    variants: [["M", "Emerald", 4], ["L", "Emerald", 4]],
  },
  {
    id: "lh_peach_blossom", slug: "peach-blossom-lehenga", name: "Peach Blossom Lehenga", categoryId: "cat_festive",
    price: 8999, fabric: "Cotton silk", workType: "Block print, gota", setIncludes: "Lehenga, blouse, dupatta", weightGrams: 1300,
    bestSeller: true, newArrival: true, tags: ["festive", "peach", "light"], skuPrefix: "RRC-FS-001", palette: PALETTES.peach,
    description: "A light cotton-silk lehenga in peach with block-printed florals and gota trim.",
    details: ["Cotton silk", "Block print with gota border", "Machine-washable lining; dry clean outer", LONG],
    variants: [["S", "Peach", 8], ["M", "Peach", 10], ["L", "Peach", 7], ["XL", "Peach", 3, 3]],
  },
  {
    id: "lh_marigold_festive", slug: "marigold-festive-lehenga", name: "Marigold Festive Lehenga", categoryId: "cat_festive",
    price: 11499, fabric: "Chanderi", workType: "Woven border, mirror", setIncludes: "Lehenga, blouse, dupatta", weightGrams: 1500,
    featured: true, tags: ["festive", "yellow", "chanderi"], skuPrefix: "RRC-FS-002", palette: PALETTES.marigold,
    description: "Chanderi in marigold yellow with a woven zari border and small mirror accents.",
    details: ["Chanderi base", "Woven border", LONG],
    variants: [["S", "Marigold", 4], ["M", "Marigold", 5], ["L", "Marigold", 0]],
  },
  {
    id: "lh_teal_peacock", slug: "teal-peacock-lehenga", name: "Teal Peacock Lehenga", categoryId: "cat_festive",
    price: 13999, compareAt: 15999, fabric: "Silk blend", workType: "Peacock motif, zari", setIncludes: "Lehenga, blouse, dupatta", weightGrams: 1700,
    tags: ["festive", "teal", "peacock"], skuPrefix: "RRC-FS-003", palette: PALETTES.teal,
    description: "Teal silk blend with a peacock motif border in zari.",
    details: ["Silk blend", "Peacock motif border", LONG],
    variants: [["S", "Teal", 3, 3], ["M", "Teal", 4], ["L", "Teal", 4]],
  },
  {
    id: "lh_midnight_charm", slug: "midnight-charm-party-lehenga", name: "Midnight Charm Party Lehenga", categoryId: "cat_party",
    price: 11499, fabric: "Satin and net", workType: "Sequin, cutdana", setIncludes: "Lehenga, blouse, dupatta", weightGrams: 1400,
    bestSeller: true, tags: ["party", "navy", "sequin"], skuPrefix: "RRC-PT-001", palette: PALETTES.midnight,
    description: "Midnight navy satin lehenga with sequin and cutdana scatter for evening events.",
    details: ["Satin with net overlay", "Sequin and cutdana work", LONG],
    variants: [["S", "Midnight", 5], ["M", "Midnight", 5], ["L", "Midnight", 3, 3]],
  },
  {
    id: "lh_wine_sequin", slug: "wine-sequin-lehenga", name: "Wine Sequin Lehenga", categoryId: "cat_party",
    price: 14999, fabric: "Net", workType: "Sequin", setIncludes: "Lehenga, blouse, dupatta", weightGrams: 1500,
    newArrival: true, tags: ["party", "wine", "sequin"], skuPrefix: "RRC-PT-002", palette: PALETTES.wine,
    description: "Deep wine net lehenga with all-over sequin and a fluid dupatta.",
    details: ["Net with satin lining", "All-over sequin", LONG],
    variants: [["S", "Wine", 4], ["M", "Wine", 4], ["L", "Wine", 2, 3], ["M", "Rani", 3]],
  },
  {
    id: "lh_silver_mist", slug: "silver-mist-lehenga", name: "Silver Mist Lehenga", categoryId: "cat_party",
    price: 16999, fabric: "Tissue", workType: "Metallic thread", setIncludes: "Lehenga, blouse, dupatta", weightGrams: 1350,
    tags: ["party", "silver", "tissue"], skuPrefix: "RRC-PT-003", palette: PALETTES.silver,
    description: "Silver tissue lehenga with metallic thread work, understated and luminous.",
    details: ["Tissue fabric", "Metallic thread detailing", LONG],
    variants: [["S", "Silver", 2, 3], ["M", "Silver", 3, 3]],
  },
  {
    id: "lh_custom_bridal", slug: "made-to-measure-bridal-lehenga", name: "Made-to-Measure Bridal Lehenga", categoryId: "cat_custom",
    price: 75000, fabric: "Silk, brocade or velvet (your choice)", workType: "Zari, zardozi, thread", setIncludes: "Lehenga, blouse, dupatta, can-can", weightGrams: 3200,
    customizable: true, enquiryOnly: true, leadTimeDays: 45, featured: true, tags: ["custom", "bridal", "made to measure"], skuPrefix: "RRC-CU-001", palette: PALETTES.rani,
    description: "A bridal lehenga made to your measurements, palette and embroidery brief. Price shown is indicative; the final quote is agreed with you before any payment.",
    details: ["Cut and stitched to your measurements", "Palette, fabric and embroidery agreed in conversation", "Production lead time is in addition to delivery time", "Final quote and advance agreed before production starts", LONG],
    variants: [["Custom", "As agreed", 99]],
  },
  {
    id: "lh_custom_sangeet", slug: "made-to-measure-sangeet-lehenga", name: "Made-to-Measure Sangeet Lehenga", categoryId: "cat_custom",
    price: 32000, fabric: "Georgette, net or organza", workType: "Sequin, thread, mirror", setIncludes: "Lehenga, blouse, dupatta", weightGrams: 1800,
    customizable: true, enquiryOnly: true, leadTimeDays: 28, tags: ["custom", "sangeet", "made to measure"], skuPrefix: "RRC-CU-002", palette: PALETTES.sage,
    description: "A lighter made-to-measure lehenga for sangeet and mehendi. Indicative price; quoted after a conversation.",
    details: ["Cut and stitched to your measurements", "Lead time shown is production only", LONG],
    variants: [["Custom", "As agreed", 99]],
  },
  {
    id: "ac_maang_tikka", slug: "kundan-maang-tikka-set", name: "Kundan Maang Tikka Set", categoryId: "cat_accessories",
    price: 2499, fabric: "Gold-plated alloy", workType: "Kundan-style stones", setIncludes: "Maang tikka, matching earrings", weightGrams: 120,
    newArrival: true, tags: ["accessory", "jewellery", "tikka"], skuPrefix: "RRC-AC-001",
    accessory: { kind: "tikka", base: "#d4af37", accent: "#a3202f", bg1: "#f1e6cc", bg2: "#d8bd86" },
    description: "A gold-plated maang tikka with matching earrings, set with ruby-red stones.",
    details: ["Gold-plated alloy", "Adjustable chain", "Imitation jewellery - avoid contact with water and perfume", LONG],
    variants: [["Free Size", "Gold", 12]],
  },
  {
    id: "ac_jhumka", slug: "pearl-drop-jhumkas", name: "Pearl Drop Jhumkas", categoryId: "cat_accessories",
    price: 1499, fabric: "Gold-plated alloy", workType: "Faux pearl", setIncludes: "One pair", weightGrams: 60,
    tags: ["accessory", "jewellery", "jhumka"], skuPrefix: "RRC-AC-002",
    accessory: { kind: "jhumka", base: "#d4af37", accent: "#faf8f3", bg1: "#f5e6e6", bg2: "#dbb3b3" },
    description: "Classic jhumkas with faux pearl drops.",
    details: ["Gold-plated alloy", "Faux pearls", LONG],
    variants: [["Free Size", "Gold", 20], ["Free Size", "Silver tone", 2, 3]],
  },
  {
    id: "ac_potli", slug: "embroidered-potli-bag", name: "Embroidered Potli Bag", categoryId: "cat_accessories",
    price: 1999, fabric: "Raw silk", workType: "Zari embroidery", setIncludes: "Potli with wrist loop", weightGrams: 180,
    bestSeller: true, tags: ["accessory", "potli", "bag"], skuPrefix: "RRC-AC-003",
    accessory: { kind: "potli", base: "#7a1a2e", accent: "#a3202f", bg1: "#e9d3c6", bg2: "#c99a86" },
    description: "A small raw silk potli with zari embroidery, sized for phone, keys and lipstick.",
    details: ["Raw silk with zari", "Drawstring closure", LONG],
    variants: [["Free Size", "Maroon", 15], ["Free Size", "Ivory", 0]],
  },
  {
    id: "ac_dupatta", slug: "net-dupatta-with-gold-border", name: "Net Dupatta with Gold Border", categoryId: "cat_accessories",
    price: 3499, fabric: "Net", workType: "Gold border", setIncludes: "Dupatta (2.5 m)", weightGrams: 260,
    tags: ["accessory", "dupatta"], skuPrefix: "RRC-AC-004",
    accessory: { kind: "dupatta", base: "#c25b6d", accent: "#f1d77b", bg1: "#f4dfe6", bg2: "#d596ac" },
    description: "A fine net dupatta with a woven gold border, a quick way to restyle a plain lehenga.",
    details: ["Net with gold border", "2.5 m length", LONG],
    variants: [["Free Size", "Rose", 9], ["Free Size", "Ivory", 6]],
  },
  {
    id: "lh_draft_sample", slug: "unpublished-sample-lehenga", name: "Unpublished Sample Lehenga", categoryId: "cat_festive",
    price: 9999, fabric: "Cotton silk", workType: "Print", setIncludes: "Lehenga, blouse, dupatta", weightGrams: 1300, status: "draft",
    tags: ["draft"], skuPrefix: "RRC-FS-099", palette: PALETTES.sage,
    description: "A draft product used to prove that drafts never appear on the storefront.",
    details: ["Draft"], variants: [["M", "Sage", 3]],
  },
];

export const SEED_COUPONS = [
  { code: "WELCOME10", type: "percent" as const, value: 1000, minSubtotal: 500_000, maxDiscount: 200_000, usageLimit: null, perUserLimit: 1, description: "10% off orders above Rs 5,000 (demo coupon)" },
  { code: "FLAT500", type: "fixed" as const, value: 50_000, minSubtotal: 1_000_000, maxDiscount: null, usageLimit: 100, perUserLimit: null, description: "Rs 500 off orders above Rs 10,000 (demo coupon)" },
];
