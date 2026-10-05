import Link from "next/link";
import clsx from "clsx";
import { Media } from "@/components/ui/media";
import { Price } from "@/components/ui/price";
import { WishlistButton } from "./wishlist-button";
import { isOnSale, type ListingProduct } from "@/domain/catalog";
import { percentOff } from "@/domain/money";

export function ProductCard({ product: p, priority, className }: { product: ListingProduct; priority?: boolean; className?: string }) {
  const soldOut = !p.enquiryOnly && p.availableUnits <= 0;
  const badge = soldOut ? "Sold out" : p.enquiryOnly ? "Made to measure" : isOnSale(p) ? `${percentOff(p.price, p.compareAtPrice)}% off` : p.isNewArrival ? "New" : null;
  return (
    <article className={clsx("group relative", className)}>
      <div className="relative">
        <Link href={`/product/${p.slug}`} className="block" aria-label={p.name} tabIndex={-1}>
          <Media src={p.image?.src} alt="" ratio="4/5" priority={priority} className={clsx(soldOut && "opacity-70")} imgClassName="transition-opacity duration-500 group-hover:opacity-0 motion-reduce:transition-none" />
          {p.imageHover && (
            <span className="absolute inset-0 block opacity-0 transition-opacity duration-500 group-hover:opacity-100 motion-reduce:transition-none">
              <Media src={p.imageHover.src} alt="" ratio="4/5" />
            </span>
          )}
        </Link>
        {badge && (
          <span className={clsx("absolute left-2 top-2 rounded-sm px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wider", soldOut ? "bg-charcoal text-white" : "bg-maroon text-white")}>
            {badge}
          </span>
        )}
        <WishlistButton productId={p.id} name={p.name} className="absolute right-1.5 top-1.5" />
        {p.isDemo && <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-sm bg-white/85 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-ink-muted">Sample photo</span>}
      </div>
      <div className="mt-3 space-y-1">
        <h3 className="font-sans text-[0.95rem] font-medium leading-snug text-charcoal">
          <Link href={`/product/${p.slug}`} className="underline-offset-4 hover:text-maroon hover:underline">
            {p.name}
          </Link>
        </h3>
        <Price price={p.price} compareAt={p.compareAtPrice} size="sm" from={p.enquiryOnly} />
      </div>
    </article>
  );
}

export function ProductGrid({ products, priorityCount = 0, className }: { products: ListingProduct[]; priorityCount?: number; className?: string }) {
  return (
    <ul className={clsx("grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-6", className)}>
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard product={p} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
