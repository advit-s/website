import { badRequest, handle, json } from "@/server/http";
import { getListing } from "@/server/repos/catalog";
import { C, col } from "@/server/repos/common";
import { fromDoc } from "@/server/repos/catalog";
import { availableUnits, type Variant } from "@/domain/types";

/** Public catalogue DTOs for a handful of product ids (wishlist). Bounded to 40 ids; only published, active-category products are returned. */
export const GET = handle(async (req) => {
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length > 40) throw badRequest("Too many ids.");
  const listing = await getListing();
  const wanted = new Set(ids);
  const products = listing.filter((p) => wanted.has(p.id));
  const buyable = products.filter((p) => !p.enquiryOnly).map((p) => p.id);
  const variants: { id: string; productId: string; size: string; color: string; available: number }[] = [];
  for (let i = 0; i < buyable.length; i += 30) {
    const snap = await col(C.variants).where("productId", "in", buyable.slice(i, i + 30)).get();
    snap.docs.map((d) => fromDoc<Variant>(d)).forEach((v) => variants.push({ id: v.id, productId: v.productId, size: v.size, color: v.color, available: availableUnits(v) }));
  }
  return json({ products, variants });
});
