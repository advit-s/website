import type { Paise } from "./money";

export type ISODate = string;

export type ProductStatus = "draft" | "published" | "archived";

export interface ProductImage {
  /** Storage object path (preferred) or absolute/relative URL for seeded placeholder art. */
  src: string;
  alt: string;
  order: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  version: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string;
  details: string[];
  /** Selling price in paise. */
  price: Paise;
  /** Original price; shown struck-through when higher than price. */
  compareAtPrice: Paise | null;
  fabric: string;
  workType: string;
  setIncludes: string;
  weightGrams: number;
  isCustomizable: boolean;
  /** Made-to-measure only: no add-to-cart; the owner quotes after an enquiry. Price shown is indicative ("from"). */
  enquiryOnly: boolean;
  leadTimeDays: number | null;
  isFeatured: boolean;
  isBestSeller: boolean;
  isNewArrival: boolean;
  status: ProductStatus;
  images: ProductImage[];
  tags: string[];
  seo: { title: string; description: string };
  /** Denormalised facets for catalog filtering (kept in sync when variants change). */
  sizes: string[];
  colors: string[];
  /** Sum of sellable units across variants (denormalised, transactionally maintained). */
  availableUnits: number;
  searchTokens: string[];
  isDemo: boolean;
  version: number;
  createdAt: ISODate;
  updatedAt: ISODate;
  publishedAt: ISODate | null;
}

export interface Variant {
  id: string;
  productId: string;
  productName: string;
  categoryId: string;
  size: string;
  color: string;
  sku: string;
  /** On-hand units. */
  stock: number;
  /** Units held by unexpired prepaid reservations. */
  reserved: number;
  lowStockThreshold: number;
  /** Maintained with stock/reserved: available <= lowStockThreshold. */
  isLowStock: boolean;
  priceOverride: Paise | null;
  version: number;
  updatedAt: ISODate;
}

export const availableUnits = (v: Pick<Variant, "stock" | "reserved">): number => Math.max(0, v.stock - v.reserved);

/* ------------------------------------------------------------------ orders */

export const FULFILMENT_STATUSES = ["new", "confirmed", "processing", "shipped", "out_for_delivery", "delivered", "cancelled"] as const;
export type FulfilmentStatus = (typeof FULFILMENT_STATUSES)[number];

export const PAYMENT_STATUSES = ["pending", "paid", "failed", "partially_refunded", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type PaymentMethod = "razorpay" | "cod";

export const RETURN_STATUSES = ["none", "requested", "approved", "rejected", "received", "refund_pending", "closed"] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export type RefundState = "requested" | "processing" | "completed" | "failed";

export interface RefundRecord {
  id: string;
  amount: Paise;
  state: RefundState;
  reason: string;
  providerRefundId: string | null;
  /** For COD refunds the reference is recorded, never published. */
  reference: string | null;
  requestedBy: string;
  requestedAt: ISODate;
  updatedAt: ISODate;
  idempotencyKey: string;
}

export interface Address {
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  country: "IN";
}

export interface SavedAddress extends Address {
  id: string;
  label: string;
  isDefault: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface OrderItem {
  productId: string;
  variantId: string;
  sku: string;
  nameSnapshot: string;
  imageSnapshot: string | null;
  size: string;
  color: string;
  unitPrice: Paise;
  quantity: number;
  lineTotal: Paise;
  weightGrams: number;
  isCustomizable: boolean;
  leadTimeDays: number | null;
}

export interface OrderPricing {
  subtotal: Paise;
  discount: Paise;
  couponCode: string | null;
  shipping: Paise;
  codFee: Paise;
  total: Paise;
  currency: "INR";
}

export type ShipmentProvider = "shiprocket" | "manual";

export interface OrderShipment {
  zone: "ncr" | "rest";
  estimateText: string;
  provider: ShipmentProvider | null;
  shiprocketOrderId: string | null;
  awbNumber: string | null;
  courierName: string | null;
  trackingUrl: string | null;
  shippedAt: ISODate | null;
  deliveredAt: ISODate | null;
}

export interface OrderPayment {
  razorpayOrderId: string | null;
  /** Every provider order created for this order (one per attempt) so a late capture on an earlier attempt still matches. */
  providerOrderIds: string[];
  razorpayPaymentId: string | null;
  attempts: number;
  capturedAt: ISODate | null;
  lastError: string | null;
  refunds: RefundRecord[];
  refundedTotal: Paise;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string | null;
  contact: { name: string; email: string; phone: string };
  status: FulfilmentStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  returnStatus: ReturnStatus;
  items: OrderItem[];
  pricing: OrderPricing;
  shippingAddress: Address;
  shipment: OrderShipment;
  payment: OrderPayment;
  reservationId: string | null;
  stockState: "reserved" | "committed" | "released" | "none";
  needsReview: boolean;
  integrationMode: "simulated" | "live";
  hasCustomItems: boolean;
  /** Custom orders: agreed quote and advance (never auto-charged from list price). */
  custom: {
    quotedTotal: Paise | null;
    advancePaid: Paise;
    leadTimeDays: number | null;
    productionState: "enquiry" | "quoted" | "in_production" | "ready" | null;
  } | null;
  cancelReason: string | null;
  idempotencyKey: string;
  placedAt: ISODate;
  updatedAt: ISODate;
  version: number;
}

export interface TimelineEvent {
  id: string;
  type: string;
  label: string;
  detail: string | null;
  customerVisible: boolean;
  actor: string; // "system" | "customer" | "provider" | admin uid
  at: ISODate;
}
