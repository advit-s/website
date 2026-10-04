"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import type { FacetCount } from "@/domain/catalog";

export interface FilterState {
  q: string;
  category: string | null;
  collection: string | null;
  sort: string;
  minPrice: number | null; // rupees
  maxPrice: number | null;
  sizes: string[];
  colors: string[];
  fabrics: string[];
}

interface Props {
  basePath: string;
  state: FilterState;
  facets: { sizes: FacetCount[]; colors: FacetCount[]; fabrics: FacetCount[]; priceMin: number; priceMax: number };
  activeCount: number;
  /** category pages fix the category; /shop lets people pick one */
  categories?: { slug: string; name: string }[];
}

function Group({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-b border-line py-5">
      <legend className="t-eyebrow mb-3 text-maroon">{legend}</legend>
      <div className="space-y-1">{children}</div>
    </fieldset>
  );
}

function Check({ name, value, label, count, checked }: { name: string; value: string; label: string; count: number; checked: boolean }) {
  return (
    <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm">
      <input type="checkbox" name={name} value={value} defaultChecked={checked} className="size-[1.1rem] accent-[#4a1020]" />
      <span className="flex-1">{label}</span>
      <span className="text-xs text-ink-muted">{count}</span>
    </label>
  );
}

/** URL-driven filters. Works as a plain GET form; JS enhances it by applying changes immediately. */
export function FilterForm({ basePath, state, facets, categories }: Omit<Props, "activeCount">) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const apply = (form: HTMLFormElement) => {
    const fd = new FormData(form);
    const sp = new URLSearchParams();
    const multi: Record<string, string[]> = {};
    for (const [k, v] of fd.entries()) {
      if (typeof v !== "string" || !v) continue;
      if (k === "size" || k === "color" || k === "fabric") (multi[k] ??= []).push(v);
      else sp.set(k, v);
    }
    for (const [k, vals] of Object.entries(multi)) sp.set(k, vals.join(","));
    const s = sp.toString();
    router.push(s ? `${basePath}?${s}` : basePath, { scroll: false });
  };

  return (
    <form
      ref={formRef}
      action={basePath}
      method="get"
      onChange={(e) => {
        // Debounce typing in price inputs; checkboxes apply immediately.
        const t = e.target as unknown as HTMLInputElement;
        if (t.type === "number") return;
        apply(e.currentTarget);
      }}
      onSubmit={(e) => {
        e.preventDefault();
        apply(e.currentTarget);
      }}
    >
      {state.q && <input type="hidden" name="q" value={state.q} />}
      {state.collection && <input type="hidden" name="collection" value={state.collection} />}
      {state.sort !== "featured" && <input type="hidden" name="sort" value={state.sort} />}
      {!categories && state.category && <input type="hidden" name="category" value={state.category} />}

      {categories && (
        <Group legend="Category">
          <label className="flex min-h-9 items-center gap-2.5 text-sm">
            <input type="radio" name="category" value="" defaultChecked={!state.category} className="size-[1.1rem] accent-[#4a1020]" /> All categories
          </label>
          {categories.map((c) => (
            <label key={c.slug} className="flex min-h-9 items-center gap-2.5 text-sm">
              <input type="radio" name="category" value={c.slug} defaultChecked={state.category === c.slug} className="size-[1.1rem] accent-[#4a1020]" /> {c.name}
            </label>
          ))}
        </Group>
      )}

      <Group legend="Price (INR)">
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`min-${basePath}`}>
            Minimum price in rupees
          </label>
          <Input id={`min-${basePath}`} name="minPrice" type="number" min={0} max={99999999} step={100} inputMode="numeric" placeholder={`Min ${Math.floor(facets.priceMin / 100)}`} defaultValue={state.minPrice ?? ""} className="min-h-10" />
          <span aria-hidden>&ndash;</span>
          <label className="sr-only" htmlFor={`max-${basePath}`}>
            Maximum price in rupees
          </label>
          <Input id={`max-${basePath}`} name="maxPrice" type="number" min={0} max={99999999} step={100} inputMode="numeric" placeholder={`Max ${Math.ceil(facets.priceMax / 100)}`} defaultValue={state.maxPrice ?? ""} className="min-h-10" />
        </div>
        <Button type="submit" variant="secondary" size="sm" className="mt-2">
          Apply price
        </Button>
      </Group>

      {facets.sizes.length > 0 && (
        <Group legend="Size">
          {facets.sizes.map((f) => (
            <Check key={f.value} name="size" value={f.value} label={f.value} count={f.count} checked={state.sizes.includes(f.value)} />
          ))}
        </Group>
      )}
      {facets.colors.length > 0 && (
        <Group legend="Colour">
          {facets.colors.map((f) => (
            <Check key={f.value} name="color" value={f.value} label={f.value} count={f.count} checked={state.colors.includes(f.value)} />
          ))}
        </Group>
      )}
      {facets.fabrics.length > 0 && (
        <Group legend="Fabric">
          {facets.fabrics.map((f) => (
            <Check key={f.value} name="fabric" value={f.value} label={f.value} count={f.count} checked={state.fabrics.includes(f.value)} />
          ))}
        </Group>
      )}
    </form>
  );
}

/** Mobile: filters live in an accessible drawer; desktop renders FilterForm inline (see CatalogView). */
export function MobileFilters(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} className="lg:hidden">
        <SlidersHorizontal className="size-4" aria-hidden /> Filters{props.activeCount > 0 ? ` (${props.activeCount})` : ""}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Filters" variant="drawer-left">
        <FilterForm {...props} />
        <Button className="mt-4 w-full" onClick={() => setOpen(false)}>
          Show results
        </Button>
      </Dialog>
    </>
  );
}
