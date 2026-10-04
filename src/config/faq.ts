import type { PublicSettings } from "@/domain/settings";
import { formatINR } from "@/domain/money";

export interface FaqGroup {
  id: string;
  title: string;
  items: { id: string; q: string; a: string }[];
}

/**
 * FAQ answers are composed from the same settings that drive checkout, shipping and refund pages, so they cannot contradict them.
 * Anything that depends on a business decision not yet made says so honestly instead of inventing an answer.
 */
export function faqGroups(s: PublicSettings): FaqGroup[] {
  const d = s.delivery;
  const p = s.policy;
  const wa = s.store.whatsappNumber ? "on WhatsApp" : "through the Contact page";
  return [
    {
      id: "orders",
      title: "Orders",
      items: [
        { id: "o1", q: "Do I need an account to order?", a: "No. You can check out as a guest. An account lets you save addresses, see your order history and keep a wishlist." },
        { id: "o2", q: "How do I track my order?", a: "Use Track order with your order number and the phone number or email used at checkout. Signed-in customers can also see every order under My account." },
        { id: "o3", q: "Can I change or cancel an order?", a: "You can cancel any ready-to-ship order until it is marked Shipped, from your order page. Made-to-measure orders are cancelled by arrangement with us." },
      ],
    },
    {
      id: "payments",
      title: "Payments",
      items: [
        { id: "p1", q: "Which payment methods do you accept?", a: `Online payments (UPI, cards and netbanking) are processed by Razorpay.${s.cod.enabled ? " Cash on delivery is available on eligible pincodes." : ""} We never see or store your card or UPI PIN.` },
        { id: "p2", q: "My payment failed or the window closed. What now?", a: "You stay on the checkout page with a Try again button. Your items are held for a short time, and you may switch to cash on delivery if it is available. If money was deducted, it is matched to your order automatically or refunded." },
        { id: "p3", q: "Are prices inclusive of tax?", a: "Prices are shown inclusive of applicable taxes unless stated otherwise." },
      ],
    },
    {
      id: "shipping",
      title: "Shipping",
      items: [
        { id: "s1", q: "Do you deliver outside India?", a: "Not at the moment. We deliver within India only." },
        { id: "s2", q: "How long will delivery take?", a: `In-stock orders are estimated at ${d.ncrDays[0]}–${d.ncrDays[1]} days in Delhi NCR and ${d.restDays[0]}–${d.restDays[1]} business days elsewhere in India. These are estimates, not guarantees. Made-to-order pieces ship after production, which is additional to delivery time.` },
        { id: "s3", q: "What does delivery cost?", a: `Orders of ${formatINR(d.freeShippingThreshold)} or more ship free. Below that you see the exact charge at checkout before you pay. Heavy pieces such as most bridal lehengas may carry a freight surcharge, also shown before payment.` },
      ],
    },
    {
      id: "returns",
      title: "Returns",
      items: [
        { id: "r1", q: "What is your return policy?", a: `Ready-to-ship items can be returned within ${p.returnWindowDays} days of delivery if unused, unaltered and with tags intact. Made-to-measure pieces are not returnable.` },
        { id: "r2", q: "What if my item arrives damaged?", a: `Report it within ${p.damageReportHours} hours of delivery with photographs, ${wa}. We cover return shipping and offer a replacement or full refund.` },
        { id: "r3", q: "When will I get my refund?", a: `Approved refunds go to the original payment method within ${p.refundBusinessDaysMin}–${p.refundBusinessDaysMax} business days of the returned item passing inspection. Cash-on-delivery refunds are made by bank transfer or UPI.` },
      ],
    },
    {
      id: "sizing",
      title: "Sizing",
      items: [
        { id: "z1", q: "How do I choose my size?", a: "Each product page has a size guide with body measurements and how to measure. If you are between sizes choose the larger size, or ask us about a made-to-measure fit." },
        { id: "z2", q: "Can the blouse or length be altered?", a: `Many pieces include an unstitched blouse piece. Alteration and fitting advice is available ${wa}.` },
      ],
    },
    {
      id: "custom",
      title: "Customisation",
      items: [
        { id: "c1", q: "Can I order a lehenga made to my measurements?", a: "Yes, on pieces marked as made to order. Use the enquiry section on the product page to share your measurements and occasion date. Nothing is charged until you and the owner agree on a quote and lead time." },
        { id: "c2", q: "How long does a custom piece take?", a: "Each product page states its production lead time. This is in addition to delivery time, and the final timeline is agreed with you when the piece is quoted." },
        { id: "c3", q: "Do I pay in advance for a custom piece?", a: "A partial advance is agreed with you before production starts. Once production begins, the advance is non-refundable under our cancellation policy." },
      ],
    },
    {
      id: "cod",
      title: "Cash on delivery",
      items: [
        { id: "d1", q: "Is cash on delivery available?", a: s.cod.enabled ? `Yes, on eligible pincodes for orders up to ${formatINR(s.cod.maxOrderValue)}${s.cod.fee ? ` (handling fee ${formatINR(s.cod.fee)})` : ""}. It is not available for made-to-measure pieces.` : "Not at the moment." },
        { id: "d2", q: "When is a COD order counted as paid?", a: "Only once the cash has been collected on delivery. Until then the order shows as payment pending." },
      ],
    },
    {
      id: "care",
      title: "Care instructions",
      items: [
        { id: "k1", q: "How should I care for embroidered lehengas?", a: "Dry clean only unless a product page says otherwise. Store folded in a breathable cotton or muslin cover, away from direct sunlight, and avoid hanging heavy pieces for long periods." },
        { id: "k2", q: "Is the colour the same as in the photos?", a: "Photography is a close representation. Because many pieces are hand-embroidered, small differences in colour, sheen and embellishment placement are normal." },
      ],
    },
  ];
}
