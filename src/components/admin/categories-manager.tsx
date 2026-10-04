"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import Image from "next/image";
import { Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert, Badge } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { tableCls } from "./table-styles";
import { slugify } from "@/domain/product-build";
import { adminMediaUrl } from "@/lib/media";

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  version: number;
  productCount: number;
}

const blank = { id: "", name: "", slug: "", description: "", imageUrl: null as string | null, sortOrder: 100, isActive: true, version: 0 };

export function CategoriesManager({ rows }: { rows: CategoryRow[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<typeof blank | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<CategoryRow | null>(null);
  const [reassign, setReassign] = useState("");
  const [delError, setDelError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  async function upload(f: File) {
    const fd = new FormData();
    fd.set("file", f);
    fd.set("kind", "category");
    const r = await fetch("/api/admin/uploads", { method: "POST", body: fd });
    const d = await r.json();
    if (!r.ok) return setFormError(d?.error?.message ?? "Upload failed.");
    setEdit((e) => (e ? { ...e, imageUrl: d.path } : e));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setBusy(true);
    setErrors({});
    setFormError(null);
    const { id, version, ...rest } = edit;
    const body = { ...(id ? { id, expectedVersion: version } : {}), ...rest, sortOrder: Number(rest.sortOrder) };
    const r = await fetch("/api/admin/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      if (d?.error?.fields) setErrors(d.error.fields);
      else setFormError(d?.error?.message ?? "Could not save the category.");
      return;
    }
    setEdit(null);
    router.refresh();
  }

  async function confirmDelete() {
    if (!del) return;
    setDelError(null);
    const r = await fetch("/api/admin/categories", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: del.id, reassignTo: reassign || null }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setDelError(d?.error?.code === "REAUTH_REQUIRED" ? "For safety, sign in again (Admin > sign out, then back in) before deleting." : (d?.error?.message ?? "Could not delete."));
    setDel(null);
    setReassign("");
    router.refresh();
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => (setSlugTouched(false), setErrors({}), setFormError(null), setEdit({ ...blank, sortOrder: (rows.at(-1)?.sortOrder ?? 0) + 1 }))}>
          <Plus className="size-4" aria-hidden /> Add category
        </Button>
      </div>
      <div className={tableCls.wrap}>
        <table className={tableCls.table}>
          <caption className="sr-only">Categories</caption>
          <thead>
            <tr>
              <th className={tableCls.th}>Order</th>
              <th className={tableCls.th}>Category</th>
              <th className={tableCls.th}>Slug</th>
              <th className={tableCls.th}>Products</th>
              <th className={tableCls.th}>Status</th>
              <th className={tableCls.th}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td className={tableCls.td}>{c.sortOrder}</td>
                <td className={tableCls.td}>
                  <div className="flex items-center gap-3">
                    <span className="relative block size-10 shrink-0 overflow-hidden bg-beige">{c.imageUrl && <Image src={adminMediaUrl(c.imageUrl)} alt="" fill unoptimized sizes="40px" className="object-cover" />}</span>
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <p className="max-w-xs truncate text-xs text-ink-muted">{c.description}</p>
                    </div>
                  </div>
                </td>
                <td className={tableCls.td}>
                  <code className="text-xs">{c.slug}</code>
                </td>
                <td className={tableCls.td}>{c.productCount}</td>
                <td className={tableCls.td}>{c.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Hidden</Badge>}</td>
                <td className={tableCls.td}>
                  <div className="flex justify-end gap-1">
                    <button type="button" aria-label={`Edit ${c.name}`} className="grid size-9 place-items-center text-maroon hover:bg-beige/60" onClick={() => (setSlugTouched(true), setErrors({}), setFormError(null), setEdit({ id: c.id, name: c.name, slug: c.slug, description: c.description, imageUrl: c.imageUrl, sortOrder: c.sortOrder, isActive: c.isActive, version: c.version }))}>
                      <Pencil className="size-4" aria-hidden />
                    </button>
                    <button type="button" aria-label={`Delete ${c.name}`} className="grid size-9 place-items-center text-error hover:bg-error-bg" onClick={() => (setDelError(null), setReassign(""), setDel(c))}>
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={edit !== null} onClose={() => setEdit(null)} title={edit?.id ? "Edit category" : "Add category"} size="md">
        {edit && (
          <form onSubmit={save} noValidate className="space-y-4">
            {formError && <Alert tone="error">{formError}</Alert>}
            <Field label="Name" required error={errors.name}>
              {(f) => (
                <Input
                  id={f.id}
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value, slug: slugTouched ? edit.slug : slugify(e.target.value) })}
                />
              )}
            </Field>
            <Field label="Slug (web address)" required error={errors.slug} hint="Used in /category/<slug>. Must be unique.">
              {(f) => <Input id={f.id} value={edit.slug} onChange={(e) => (setSlugTouched(true), setEdit({ ...edit, slug: e.target.value }))} />}
            </Field>
            <Field label="Description" error={errors.description}>
              {(f) => <Textarea id={f.id} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} maxLength={500} />}
            </Field>
            <div>
              <p className="mb-1.5 text-sm font-medium">Banner image</p>
              <div className="flex items-center gap-3">
                <span className="relative block h-16 w-24 overflow-hidden bg-beige">{edit.imageUrl && <Image src={adminMediaUrl(edit.imageUrl)} alt="Category banner preview" fill unoptimized sizes="96px" className="object-cover" />}</span>
                <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="cat-file" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                <label htmlFor="cat-file" className="inline-flex min-h-10 cursor-pointer items-center gap-2 border border-maroon px-4 text-sm text-maroon hover:bg-maroon hover:text-white">
                  <Upload className="size-4" aria-hidden /> Upload
                </label>
                {edit.imageUrl && (
                  <button type="button" className="text-sm text-ink-muted underline" onClick={() => setEdit({ ...edit, imageUrl: null })}>
                    Remove
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-ink-muted">JPEG, PNG or WebP. Checked and re-encoded on the server.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sort order" error={errors.sortOrder}>
                {(f) => <Input id={f.id} type="number" min={0} value={edit.sortOrder} onChange={(e) => setEdit({ ...edit, sortOrder: Number(e.target.value) })} />}
              </Field>
              <div className="flex items-end pb-2">
                <Checkbox checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} label="Active (shown in the shop and navigation)" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEdit(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                Save category
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      <Dialog open={del !== null} onClose={() => setDel(null)} title="Delete category" size="sm">
        {del && (
          <div className="space-y-4">
            {del.productCount > 0 ? (
              <>
                <Alert tone="warning" title={`${del.productCount} product(s) use "${del.name}"`}>
                  A category with products cannot simply be deleted. Move its products to another category, or cancel and mark the category hidden instead.
                </Alert>
                <Field label="Move products to">
                  {(f) => (
                    <Select id={f.id} value={reassign} onChange={(e) => setReassign(e.target.value)}>
                      <option value="">Choose a category</option>
                      {rows.filter((r) => r.id !== del.id).map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </>
            ) : (
              <p className="text-sm">This category has no products and will be deleted permanently.</p>
            )}
            {delError && <Alert tone="error">{delError}</Alert>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDel(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={confirmDelete} disabled={del.productCount > 0 && !reassign}>
                {del.productCount > 0 ? "Move products and delete" : "Delete"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
