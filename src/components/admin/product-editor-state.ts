// Plain (non-client) module so Server Components can import the empty state and types.
export interface EditorCategory {
  id: string;
  name: string;
  isActive: boolean;
}
export interface EditorVariant {
  key: string;
  id?: string;
  size: string;
  color: string;
  sku: string;
  stock: string; // new variants: opening stock; existing: display only
  currentStock?: number;
  reserved?: number;
  version?: number;
  lowStockThreshold: string;
  priceOverride: string; // rupees
}
export interface EditorState {
  name: string;
  slug: string;
  categoryId: string;
  description: string;
  details: string; // one per line
  price: string; // rupees
  compareAtPrice: string;
  fabric: string;
  workType: string;
  setIncludes: string;
  weightGrams: string;
  isCustomizable: boolean;
  enquiryOnly: boolean;
  leadTimeDays: string;
  isFeatured: boolean;
  isBestSeller: boolean;
  isNewArrival: boolean;
  status: "draft" | "published" | "archived";
  images: { src: string; alt: string }[];
  tags: string;
  seoTitle: string;
  seoDescription: string;
  variants: EditorVariant[];
}

export const emptyEditor = (): EditorState => ({
  name: "", slug: "", categoryId: "", description: "", details: "", price: "", compareAtPrice: "", fabric: "", workType: "", setIncludes: "", weightGrams: "", isCustomizable: false, enquiryOnly: false, leadTimeDays: "",
  isFeatured: false, isBestSeller: false, isNewArrival: false, status: "draft", images: [], tags: "", seoTitle: "", seoDescription: "",
  variants: [{ key: "v0", size: "", color: "", sku: "", stock: "0", lowStockThreshold: "3", priceOverride: "" }],
});

