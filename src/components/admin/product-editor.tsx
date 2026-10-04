"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Eye, Plus, Trash2, Upload } from "lucide-react";
import { Card } from "./admin-shell";
import { Button } from "@/components/ui/button";
import { Alert, Badge } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { productInputSchema } from "@/domain/admin-schemas";
import { slugify } from "@/domain/product-build";
import { formatINR, percentOff, rupeesToPaise } from "@/domain/money";
import { adminMediaUrl } from "@/lib/media";
import type { EditorCategory, EditorState, EditorVariant } from "./product-editor-state";

const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "Free Size", "Custom"];
const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
const paise = (s: string) => (s.trim() === "" || Number.isNaN(Number(s)) ? null : rupeesToPaise(Number(s)));

function toPayload(s: EditorState, expectedVersion?: number) {
  return {
    name: s.name,
    slug: s.slug,
    categoryId: s.categoryId,
    description: s.description,
    details: s.details.split("\n").map((x) => x.trim()).filter(Boolean),
    price: paise(s.price) ?? 0,
    compareAtPrice: paise(s.compareAtPrice),
    fabric: s.fabric,
    workType: s.workType,
    setIncludes: s.setIncludes,
    weightGrams: Number.isNaN(num(s.weightGrams)) ? 0 : Math.round(num(s.weightGrams)),
    isCustomizable: s.isCustomizable,
    enquiryOnly: s.enquiryOnly,
    leadTimeDays: Number.isNaN(num(s.leadTimeDays)) ? null : Math.round(num(s.leadTimeDays)),
    isFeatured: s.isFeatured,
    isBestSeller: s.isBestSeller,
    isNewArrival: s.isNewArrival,
    status: s.status,
    images: s.images.map((im, i) => ({ src: im.src, alt: im.alt, order: i })),
    tags: s.tags.split(",").map((t) => t.trim()).filter(Boolean),
    seo: { title: s.seoTitle, description: s.seoDescription },
    variants: s.variants.map((v) => ({
      ...(v.id ? { id: v.id } : {}),
      size: v.size,
      color: v.color,
      sku: v.sku,
      stock: v.id ? 0 : Math.max(0, Math.round(num(v.stock) || 0)),
      lowStockThreshold: Math.max(0, Math.round(num(v.lowStockThreshold) || 0)),
      priceOverride: paise(v.priceOverride),
    })),
    ...(expectedVersion ? { expectedVersion } : {}),
  };
}

export function ProductEditor({ initial, categories, productId, version, isDemo }: { initial: EditorState; categories: EditorCategory[]; productId: string | null; version?: number; isDemo?: boolean }) {
  const router = useRouter();
  const [s, setS] = useState<EditorState>(initial);
  const [baseline, setBaseline] = useState(JSON.stringify(initial));
  const [ver, setVer] = useState(version);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState<null | "draft" | "publish" | "save">(null);
  const [uploading, setUploading] = useState(false);
  const [slugTouched, setSlugTouched] = useState(Boolean(productId));
  const [gen, setGen] = useState({ sizes: new Set<string>(), colors: "" });
  const dirty = useMemo(() => JSON.stringify(s) !== baseline, [s, baseline]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Unsaved-changes guard for tab close / reload.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => (e.preventDefault(), (e.returnValue = ""));
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const set = useCallback(<K extends keyof EditorState>(k: K, v: EditorState[K]) => setS((p) => ({ ...p, [k]: v })), []);
  const setVariant = (i: number, patch: Partial<EditorVariant>) => setS((p) => ({ ...p, variants: p.variants.map((v, n) => (n === i ? { ...v, ...patch } : v)) }));

  const err = (path: string) => errors[path] ?? null;

  async function submit(target: "draft" | "publish" | "save") {
    const status = target === "draft" ? "draft" : target === "publish" ? "published" : s.status;
    const next = { ...s, status };
    const payload = toPayload(next, ver);
    const parsed = productInputSchema.safeParse(payload);
    if (!parsed.success) {
      const e: Record<string, string> = {};
      for (const issue of parsed.error.issues) e[issue.path.join(".")] ??= issue.message;
      setErrors(e);
      setBanner({ tone: "error", text: `Please fix ${Object.keys(e).length} field(s) highlighted below.` });
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setErrors({});
    setBanner(null);
    setBusy(target);
    const r = await fetch(productId ? `/api/admin/products/${productId}` : "/api/admin/products", { method: productId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) {
      if (d?.error?.fields) setErrors(d.error.fields);
      setBanner({ tone: "error", text: d?.error?.message ?? "Could not save the product." });
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setS(next);
    setBaseline(JSON.stringify(next));
    setVer(d.version);
    setBanner({ tone: "success", text: status === "published" ? "Saved and published." : "Saved." });
    if (!productId) router.replace(`/admin/products/${d.id}`);
    else router.refresh();
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setBanner(null);
    for (const f of Array.from(files).slice(0, 12 - s.images.length)) {
      const fd = new FormData();
      fd.set("file", f);
      fd.set("kind", "product");
      const r = await fetch("/api/admin/uploads", { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setBanner({ tone: "error", text: `${f.name}: ${d?.error?.message ?? "upload failed"}` });
        continue;
      }
      setS((p) => ({ ...p, images: [...p.images, { src: d.path, alt: "" }] }));
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  const moveImg = (i: number, dir: -1 | 1) =>
    setS((p) => {
      const imgs = [...p.images];
      const j = i + dir;
      if (j < 0 || j >= imgs.length) return p;
      [imgs[i], imgs[j]] = [imgs[j]!, imgs[i]!];
      return { ...p, images: imgs };
    });

  function generateVariants() {
    const colors = gen.colors.split(",").map((c) => c.trim()).filter(Boolean);
    if (!gen.sizes.size || !colors.length) return setBanner({ tone: "error", text: "Pick at least one size and enter at least one colour (comma-separated)." });
    const base = (s.slug || slugify(s.name) || "item").toUpperCase().replace(/-/g, "").slice(0, 8);
    const existing = new Set(s.variants.filter((v) => v.size && v.color).map((v) => `${v.size.toLowerCase()}|${v.color.toLowerCase()}`));
    const add: EditorVariant[] = [];
    for (const size of gen.sizes) for (const color of colors) {
      if (existing.has(`${size.toLowerCase()}|${color.toLowerCase()}`)) continue;
      add.push({ key: `g${Date.now()}${add.length}`, size, color, sku: `RRC-${base}-${size.replace(/\s+/g, "").toUpperCase().slice(0, 3)}-${color.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 3)}`, stock: "0", lowStockThreshold: "3", priceOverride: "" });
    }
    setS((p) => ({ ...p, variants: [...p.variants.filter((v) => v.size || v.color || v.sku), ...add] }));
  }

  const price = paise(s.price);
  const compare = paise(s.compareAtPrice);
  const off = price != null && compare != null ? percentOff(price, compare) : 0;
  const catInactive = categories.find((c) => c.id === s.categoryId && !c.isActive);

  return (
    <form onSubmit={(e) => e.preventDefault()} noValidate className="space-y-5 pb-24">
      {banner && (
        <Alert tone={banner.tone} className="sticky top-16 z-20 shadow-sm">
          {banner.text}
        </Alert>
      )}
      {isDemo && <Alert tone="warning">This is a demo product with generated placeholder images. Replace the images before launch.</Alert>}

      <Card title="1. Basic information" action={productId ? <Badge tone="info">Editing existing product</Badge> : undefined}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Product name" required error={err("name")}>
            {(f) => (
              <Input id={f.id} value={s.name} aria-invalid={f.invalid} onChange={(e) => setS((p) => ({ ...p, name: e.target.value, slug: slugTouched ? p.slug : slugify(e.target.value) }))} />
            )}
          </Field>
          <Field label="URL slug" required error={err("slug")} hint={`/product/${s.slug || "your-slug"}`}>
            {(f) => <Input id={f.id} value={s.slug} aria-invalid={f.invalid} onChange={(e) => (setSlugTouched(true), set("slug", e.target.value.toLowerCase()))} />}
          </Field>
          <Field label="Fabric" error={err("fabric")}>{(f) => <Input id={f.id} value={s.fabric} onChange={(e) => set("fabric", e.target.value)} placeholder="Silk, georgette, net" />}</Field>
          <Field label="Work type" error={err("workType")}>{(f) => <Input id={f.id} value={s.workType} onChange={(e) => set("workType", e.target.value)} placeholder="Zari, zardozi, sequin" />}</Field>
          <Field label="Set includes" error={err("setIncludes")}>{(f) => <Input id={f.id} value={s.setIncludes} onChange={(e) => set("setIncludes", e.target.value)} placeholder="Lehenga, blouse, dupatta" />}</Field>
          <Field label="Weight (grams)" hint="Used for delivery charges" error={err("weightGrams")}>{(f) => <Input id={f.id} type="number" min={0} value={s.weightGrams} onChange={(e) => set("weightGrams", e.target.value)} />}</Field>
          <Field label="Tags" hint="Comma-separated" className="md:col-span-2">{(f) => <Input id={f.id} value={s.tags} onChange={(e) => set("tags", e.target.value)} placeholder="bridal, maroon, wedding" />}</Field>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Checkbox checked={s.isFeatured} onChange={(e) => set("isFeatured", e.target.checked)} label="Featured (shown on the homepage)" />
          <Checkbox checked={s.isBestSeller} onChange={(e) => set("isBestSeller", e.target.checked)} label="Bestseller" />
          <Checkbox checked={s.isNewArrival} onChange={(e) => set("isNewArrival", e.target.checked)} label="New arrival" />
        </div>
      </Card>

      <Card title="2. Images">
        <p className="mb-3 text-sm text-ink-muted">The first image is the primary image. Every image needs alt text describing it. Uploads are checked and re-encoded as WebP on the server (JPEG, PNG or WebP, up to 8 MB).</p>
        {err("images") && <p role="alert" className="mb-2 text-sm font-medium text-error">{err("images")}</p>}
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {s.images.map((im, i) => (
            <li key={im.src + i} className="flex gap-3 rounded-md border border-line p-2">
              <span className="relative block h-24 w-20 shrink-0 overflow-hidden bg-beige">
                <Image src={adminMediaUrl(im.src)} alt="" fill unoptimized sizes="80px" className="object-cover" />
                {i === 0 && <span className="absolute left-0 top-0 bg-maroon px-1.5 py-0.5 text-[0.6rem] uppercase text-white">Primary</span>}
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <label className="sr-only" htmlFor={`alt-${i}`}>Alt text for image {i + 1}</label>
                <Input id={`alt-${i}`} value={im.alt} onChange={(e) => setS((p) => ({ ...p, images: p.images.map((x, n) => (n === i ? { ...x, alt: e.target.value } : x)) }))} placeholder="Describe this image" className="min-h-9 text-sm" aria-invalid={Boolean(err(`images.${i}.alt`))} />
                {err(`images.${i}.alt`) && <p role="alert" className="text-xs text-error">{err(`images.${i}.alt`)}</p>}
                <div className="flex gap-1">
                  <button type="button" aria-label={`Move image ${i + 1} earlier`} disabled={i === 0} onClick={() => moveImg(i, -1)} className="grid size-8 place-items-center border border-line disabled:opacity-30"><ArrowUp className="size-4" aria-hidden /></button>
                  <button type="button" aria-label={`Move image ${i + 1} later`} disabled={i === s.images.length - 1} onClick={() => moveImg(i, 1)} className="grid size-8 place-items-center border border-line disabled:opacity-30"><ArrowDown className="size-4" aria-hidden /></button>
                  <button type="button" aria-label={`Remove image ${i + 1}`} onClick={() => setS((p) => ({ ...p, images: p.images.filter((_, n) => n !== i) }))} className="grid size-8 place-items-center border border-line text-error"><Trash2 className="size-4" aria-hidden /></button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3">
          <input ref={fileRef} id="img-files" type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => onFiles(e.target.files)} />
          <label htmlFor="img-files" className="inline-flex min-h-10 cursor-pointer items-center gap-2 border border-maroon px-4 text-sm text-maroon hover:bg-maroon hover:text-white">
            <Upload className="size-4" aria-hidden /> {uploading ? "Uploading..." : "Upload images"}
          </label>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="3. Pricing">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Selling price (INR)" required error={err("price")}>{(f) => <Input id={f.id} type="number" min={1} step="0.01" inputMode="decimal" value={s.price} onChange={(e) => set("price", e.target.value)} aria-invalid={f.invalid} />}</Field>
            <Field label="Compare-at / MRP (INR)" hint="Leave empty for no markdown" error={err("compareAtPrice")}>{(f) => <Input id={f.id} type="number" min={1} step="0.01" inputMode="decimal" value={s.compareAtPrice} onChange={(e) => set("compareAtPrice", e.target.value)} aria-invalid={f.invalid} />}</Field>
          </div>
          {price != null && (
            <p className="mt-3 rounded-sm bg-info-bg p-3 text-sm text-info">
              Customers will see {formatINR(price)}
              {compare != null && compare > price ? <> <s>{formatINR(compare)}</s> ({off}% off)</> : null}. Stored internally as {price} paise.
            </p>
          )}
        </Card>
        <Card title="Made to order">
          <div className="space-y-3">
            <Checkbox checked={s.isCustomizable} onChange={(e) => set("isCustomizable", e.target.checked)} label="Can be made to measure (shows the enquiry section and lead time)" />
            <Checkbox checked={s.enquiryOnly} onChange={(e) => (set("enquiryOnly", e.target.checked), e.target.checked && set("isCustomizable", true))} label="Enquiry only - no add to cart; price shown is indicative and the owner quotes" />
            {err("enquiryOnly") && <p role="alert" className="text-xs text-error">{err("enquiryOnly")}</p>}
            <Field label="Production lead time (days)" hint="Shown separately from delivery time" error={err("leadTimeDays")}>
              {(f) => <Input id={f.id} type="number" min={1} value={s.leadTimeDays} onChange={(e) => set("leadTimeDays", e.target.value)} disabled={!s.isCustomizable} />}
            </Field>
          </div>
        </Card>
      </div>

      <Card title="4. Variants and inventory">
        <p className="mb-3 text-sm text-ink-muted">
          Each size/colour is its own variant with a unique SKU. Opening stock can be set for <strong>new</strong> variants only; to change stock on an existing variant use <Link href="/admin/inventory" className="text-maroon underline underline-offset-4">Inventory</Link>, which checks versions so concurrent sales are never overwritten.
        </p>
        {err("variants") && <p role="alert" className="mb-2 text-sm font-medium text-error">{err("variants")}</p>}
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="pb-2 pr-2">Size</th><th className="pb-2 pr-2">Colour</th><th className="pb-2 pr-2">SKU</th><th className="pb-2 pr-2">Stock</th><th className="pb-2 pr-2">Low-stock at</th><th className="pb-2 pr-2">Price override (INR)</th><th className="pb-2"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {s.variants.map((v, i) => (
                <tr key={v.key} className="align-top">
                  <td className="py-1 pr-2">
                    <label className="sr-only" htmlFor={`vs-${i}`}>Size, variant {i + 1}</label>
                    <Input id={`vs-${i}`} list="size-list" value={v.size} onChange={(e) => setVariant(i, { size: e.target.value })} className="min-h-9 w-28" aria-invalid={Boolean(err(`variants.${i}.size`))} />
                    {err(`variants.${i}.size`) && <p role="alert" className="text-xs text-error">{err(`variants.${i}.size`)}</p>}
                  </td>
                  <td className="py-1 pr-2">
                    <label className="sr-only" htmlFor={`vc-${i}`}>Colour, variant {i + 1}</label>
                    <Input id={`vc-${i}`} value={v.color} onChange={(e) => setVariant(i, { color: e.target.value })} className="min-h-9 w-32" aria-invalid={Boolean(err(`variants.${i}.color`))} />
                    {err(`variants.${i}.color`) && <p role="alert" className="text-xs text-error">{err(`variants.${i}.color`)}</p>}
                  </td>
                  <td className="py-1 pr-2">
                    <label className="sr-only" htmlFor={`vk-${i}`}>SKU, variant {i + 1}</label>
                    <Input id={`vk-${i}`} value={v.sku} onChange={(e) => setVariant(i, { sku: e.target.value.toUpperCase() })} className="min-h-9 w-44 font-mono text-xs" aria-invalid={Boolean(err(`variants.${i}.sku`))} />
                    {err(`variants.${i}.sku`) && <p role="alert" className="text-xs text-error">{err(`variants.${i}.sku`)}</p>}
                  </td>
                  <td className="py-1 pr-2">
                    {v.id ? (
                      <span className="inline-block min-h-9 py-2 text-sm">{v.currentStock} <span className="text-xs text-ink-muted">on hand{v.reserved ? `, ${v.reserved} held` : ""}</span></span>
                    ) : (
                      <>
                        <label className="sr-only" htmlFor={`vst-${i}`}>Opening stock, variant {i + 1}</label>
                        <Input id={`vst-${i}`} type="number" min={0} value={v.stock} onChange={(e) => setVariant(i, { stock: e.target.value })} className="min-h-9 w-24" />
                      </>
                    )}
                  </td>
                  <td className="py-1 pr-2">
                    <label className="sr-only" htmlFor={`vt-${i}`}>Low stock threshold, variant {i + 1}</label>
                    <Input id={`vt-${i}`} type="number" min={0} value={v.lowStockThreshold} onChange={(e) => setVariant(i, { lowStockThreshold: e.target.value })} className="min-h-9 w-24" />
                  </td>
                  <td className="py-1 pr-2">
                    <label className="sr-only" htmlFor={`vp-${i}`}>Price override, variant {i + 1}</label>
                    <Input id={`vp-${i}`} type="number" min={1} step="0.01" value={v.priceOverride} onChange={(e) => setVariant(i, { priceOverride: e.target.value })} placeholder="Same as product" className="min-h-9 w-36" />
                  </td>
                  <td className="py-1">
                    <button type="button" aria-label={`Remove variant ${i + 1}`} disabled={s.variants.length === 1} onClick={() => setS((p) => ({ ...p, variants: p.variants.filter((_, n) => n !== i) }))} className="grid size-9 place-items-center text-error disabled:opacity-30"><Trash2 className="size-4" aria-hidden /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id="size-list">{SIZES.map((x) => <option key={x} value={x} />)}</datalist>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-4 border-t border-line pt-4">
          <Button type="button" variant="secondary" size="sm" onClick={() => setS((p) => ({ ...p, variants: [...p.variants, { key: `n${Date.now()}`, size: "", color: p.variants.at(-1)?.color ?? "", sku: "", stock: "0", lowStockThreshold: "3", priceOverride: "" }] }))}>
            <Plus className="size-4" aria-hidden /> Add variant
          </Button>
          <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <legend className="sr-only">Generate variants</legend>
            <span className="text-sm text-ink-muted">Quick add sizes:</span>
            {SIZES.map((x) => (
              <label key={x} className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="accent-[#4a1020]" checked={gen.sizes.has(x)} onChange={(e) => setGen((g) => { const n = new Set(g.sizes); if (e.target.checked) n.add(x);
 else n.delete(x);
 return { ...g, sizes: n }; })} />{x}</label>
            ))}
            <label className="sr-only" htmlFor="gen-colors">Colours (comma-separated)</label>
            <Input id="gen-colors" value={gen.colors} onChange={(e) => setGen((g) => ({ ...g, colors: e.target.value }))} placeholder="Colours: Maroon, Ivory" className="min-h-9 w-52" />
            <Button type="button" size="sm" onClick={generateVariants}>Generate</Button>
          </fieldset>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="5. Category">
          <Field label="Category" required error={err("categoryId")}>
            {(f) => (
              <Select id={f.id} value={s.categoryId} onChange={(e) => set("categoryId", e.target.value)} aria-invalid={f.invalid}>
                <option value="">Choose a category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.isActive ? "" : " (hidden)"}</option>
                ))}
              </Select>
            )}
          </Field>
          {catInactive && <p className="mt-2 text-sm text-warning">This category is hidden, so the product cannot be published in it.</p>}
        </Card>
        <Card title="6. Publish">
          <Field label="Status" hint="Draft and archived products never appear in the storefront.">
            {(f) => (
              <Select id={f.id} value={s.status} onChange={(e) => set("status", e.target.value as EditorState["status"])}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </Select>
            )}
          </Field>
          {productId && s.status === "published" && (
            <Link href={`/product/${s.slug}`} target="_blank" className="mt-3 inline-flex items-center gap-1.5 text-sm text-maroon underline underline-offset-4">
              <Eye className="size-4" aria-hidden /> View on storefront<span className="sr-only"> (opens in a new tab)</span>
            </Link>
          )}
          {s.status !== "published" && <p className="mt-3 text-xs text-ink-muted">Only published products can be previewed on the storefront.</p>}
        </Card>
      </div>

      <Card title="7. Description">
        <Field label="Description" required error={err("description")}>
          {(f) => <Textarea id={f.id} value={s.description} onChange={(e) => set("description", e.target.value)} className="min-h-32" maxLength={5000} aria-invalid={f.invalid} />}
        </Field>
        <div className="mt-4">
          <Field label="Detail points (one per line)" error={err("details")}>{(f) => <Textarea id={f.id} value={s.details} onChange={(e) => set("details", e.target.value)} className="min-h-24" />}</Field>
        </div>
      </Card>

      <Card title="8. SEO">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Meta title" hint={`${s.seoTitle.length}/70 characters (50-60 recommended)`} error={err("seo.title")}>{(f) => <Input id={f.id} value={s.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} maxLength={70} />}</Field>
          <Field label="Meta description" hint={`${s.seoDescription.length}/170 characters`} error={err("seo.description")}>{(f) => <Textarea id={f.id} value={s.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} className="min-h-20" maxLength={170} />}</Field>
        </div>
        <div className="mt-4 rounded-md border border-line bg-ivory p-3 text-sm">
          <p className="text-xs text-ink-muted">Search preview</p>
          <p className="text-[#1a0dab]">{s.seoTitle || s.name || "Product title"} | Raj Raani Collections</p>
          <p className="text-xs text-success">{(process.env.NEXT_PUBLIC_SITE_URL ?? "https://your-domain")}/product/{s.slug || "slug"}</p>
          <p className="text-ink-muted">{s.seoDescription || s.description.slice(0, 155) || "Description"}</p>
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 py-3 backdrop-blur lg:left-56">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <Link href="/admin/products" className="text-sm text-maroon underline underline-offset-4">&larr; Back to products</Link>
          <span className="text-sm" role="status" aria-live="polite">{dirty ? <span className="text-warning">Unsaved changes</span> : <span className="text-ink-muted">All changes saved</span>}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => submit("draft")} loading={busy === "draft"} disabled={busy !== null}>Save draft</Button>
            {productId && <Button type="button" variant="secondary" onClick={() => submit("save")} loading={busy === "save"} disabled={busy !== null || !dirty}>Save changes</Button>}
            <Button type="button" onClick={() => submit("publish")} loading={busy === "publish"} disabled={busy !== null}>{s.status === "published" && productId ? "Update & publish" : "Publish"}</Button>
          </div>
        </div>
      </div>
    </form>
  );
}
