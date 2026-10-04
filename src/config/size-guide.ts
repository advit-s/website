/**
 * General size chart (body measurements in cm). DRAFT: these figures are a common-sense starting chart for the demo and
 * MUST be confirmed by the owner against the real patterns before launch (docs/OWNER_SETUP.md). The product page shows this notice.
 */
export const SIZE_GUIDE = {
  isPlaceholder: true,
  unit: "cm",
  columns: ["Size", "Bust", "Waist", "Hip"],
  rows: [
    ["XS", "81-84", "63-66", "87-90"],
    ["S", "86-89", "68-71", "92-95"],
    ["M", "91-94", "73-76", "97-100"],
    ["L", "96-99", "78-81", "102-105"],
    ["XL", "101-104", "83-86", "107-110"],
    ["XXL", "106-109", "88-91", "112-115"],
  ],
  howToMeasure: [
    "Bust: around the fullest part of the chest, tape level under the arms.",
    "Waist: around the natural waistline, the narrowest part of the torso.",
    "Hip: around the fullest part of the hips, about 20 cm below the waist.",
    "If you are between sizes, choose the larger size or ask about a made-to-measure fit.",
  ],
} as const;
