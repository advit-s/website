import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { Order } from "@/domain/types";
import type { PublicSettings } from "@/domain/settings";

/**
 * Invoice / receipt PDF generated ONLY from the immutable order snapshot (item names, prices, address, totals) -
 * later edits to products, prices or saved addresses can never change an old invoice.
 * It is titled "Order invoice" unless the owner has configured a GSTIN, and it never invents tax figures.
 */
const inr = (p: number) => `INR ${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: p % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;

// Standard PDF fonts cover WinAnsi only: replace anything else so a name with unusual characters cannot crash generation.
const clean = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, "?");

export async function buildInvoicePdf(order: Order, settings: PublicSettings): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const maroon = rgb(0.29, 0.063, 0.125);
  const grey = rgb(0.36, 0.33, 0.3);
  let y = 800;
  const text = (t: string, x: number, size = 10, f: PDFFont = font, color = rgb(0.18, 0.18, 0.18)) => page.drawText(clean(t), { x, y, size, font: f, color });
  const right = (t: string, xr: number, size = 10, f: PDFFont = font) => {
    const w = f.widthOfTextAtSize(clean(t), size);
    page.drawText(clean(t), { x: xr - w, y, size, font: f, color: rgb(0.18, 0.18, 0.18) });
  };

  const gstin = settings.policy.gstin?.trim();
  text("RAJ RAANI COLLECTIONS", 40, 18, bold, maroon);
  y -= 16;
  text(settings.policy.legalName?.trim() || "Legal business name: to be provided by the owner", 40, 9, font, grey);
  y -= 12;
  text(settings.policy.registeredAddress?.trim() || "Registered address: to be provided by the owner", 40, 9, font, grey);
  y -= 12;
  text(gstin ? `GSTIN: ${gstin}` : "GSTIN: not provided", 40, 9, font, grey);
  y += 40;
  right(gstin ? "TAX INVOICE" : "ORDER INVOICE", 555, 16, bold);
  y -= 16;
  right(`No. ${order.orderNumber}`, 555, 10);
  y -= 12;
  right(`Date: ${new Date(order.placedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}`, 555, 10);
  y -= 34;

  text("Billed / shipped to", 40, 9, bold, maroon);
  text("Payment", 340, 9, bold, maroon);
  y -= 13;
  const a = order.shippingAddress;
  const addrLines = [a.fullName, a.line1, a.line2, `${a.city}, ${a.state} ${a.pincode}`, `Phone: ${a.phone}`].filter(Boolean);
  const payLines = [
    order.paymentMethod === "cod" ? "Cash on delivery" : "Online (Razorpay)",
    order.paymentMethod === "cod" ? (order.paymentStatus === "paid" ? "Paid" : "To be collected on delivery") : order.paymentStatus === "paid" ? "Paid" : order.paymentStatus,
    `Order status: ${order.status.replace(/_/g, " ")}`,
  ];
  const startY = y;
  addrLines.forEach((l) => {
    text(l, 40, 10);
    y -= 13;
  });
  const endY = y;
  y = startY;
  payLines.forEach((l) => {
    text(l, 340, 10);
    y -= 13;
  });
  y = Math.min(endY, y) - 18;

  // Items table
  page.drawRectangle({ x: 40, y: y - 4, width: 515, height: 20, color: rgb(0.91, 0.867, 0.788) });
  text("Item", 46, 9, bold);
  right("Qty", 380, 9, bold);
  right("Unit price", 470, 9, bold);
  right("Amount", 550, 9, bold);
  y -= 22;
  for (const it of order.items) {
    const name = `${it.nameSnapshot} (${it.size}, ${it.color})`;
    text(name.length > 62 ? name.slice(0, 59) + "..." : name, 46, 9.5);
    right(String(it.quantity), 380, 9.5);
    right(inr(it.unitPrice), 470, 9.5);
    right(inr(it.lineTotal), 550, 9.5);
    y -= 12;
    text(`SKU ${it.sku}`, 46, 8, font, grey);
    y -= 14;
    if (y < 140) break; // single-page invoice; very long orders are truncated with a note below
  }
  if (y < 140) text("(additional items omitted - see order details online)", 46, 8, font, grey);
  y -= 6;
  page.drawLine({ start: { x: 340, y }, end: { x: 555, y }, thickness: 0.5, color: grey });
  y -= 16;
  const row = (label: string, value: string, strong = false) => {
    text(label, 340, strong ? 11 : 10, strong ? bold : font);
    right(value, 555, strong ? 11 : 10, strong ? bold : font);
    y -= strong ? 18 : 14;
  };
  row("Subtotal", inr(order.pricing.subtotal));
  if (order.pricing.discount > 0) row(`Discount${order.pricing.couponCode ? ` (${order.pricing.couponCode})` : ""}`, `- ${inr(order.pricing.discount)}`);
  row("Delivery", order.pricing.shipping === 0 ? "Free" : inr(order.pricing.shipping));
  if (order.pricing.codFee > 0) row("Cash on delivery fee", inr(order.pricing.codFee));
  row(order.paymentMethod === "cod" && order.paymentStatus !== "paid" ? "Amount due on delivery" : "Total", inr(order.pricing.total), true);
  if (order.payment.refundedTotal > 0) row("Refunded", `- ${inr(order.payment.refundedTotal)}`);

  y -= 20;
  text(
    gstin ? "Prices are inclusive of applicable GST. Tax breakup per HSN will be shown here once tax rates are configured." : "Prices are inclusive of applicable taxes. This document is an order receipt; a GST tax invoice is available once the seller's GSTIN is configured.",
    40,
    8,
    font,
    grey,
  );
  y -= 11;
  text("Amounts are in Indian Rupees (INR). Item names, prices and address are the values at the time of purchase.", 40, 8, font, grey);
  if (order.integrationMode === "simulated") {
    y -= 20;
    text("DEMO / SIMULATED ORDER - not a real sale", 40, 11, bold, rgb(0.48, 0.29, 0));
  }
  return pdf.save();
}
