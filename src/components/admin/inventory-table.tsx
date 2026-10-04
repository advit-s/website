"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, Upload } from "lucide-react";
import clsx from "clsx";
import { tableCls } from "./admin-shell";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert, Badge } from "@/components/ui/feedback";
import type { InventoryRow, ImportRowResult } from "@/server/services/inventory";

type Draft = { stock: string; price: string; threshold: string };

export function InventoryTable({ initialRows, exportQuery }: { initialRows: InventoryRow[]; exportQuery: string }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [msgs, setMsgs] = useState<Record<string, { tone: "error" | "success"; text: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const draft = (r: InventoryRow): Draft => drafts[r.id] ?? { stock: String(r.stock), price: r.priceOverride == null ? "" : String(r.priceOverride / 100), threshold: String(r.lowStockThreshold) };
  const dirty = (r: InventoryRow) => {
    const d = drafts[r.id];
    return d != null && (d.stock !== String(r.stock) || d.price !== (r.priceOverride == null ? "" : String(r.priceOverride / 100)) || d.threshold !== String(r.lowStockThreshold));
  };

  async function save(r: InventoryRow) {
    const d = draft(r);
    const stock = Number(d.stock);
    const threshold = Number(d.threshold);
    if (!Number.isInteger(stock) || stock < 0) return setMsgs((m) => ({ ...m, [r.id]: { tone: "error", text: "Stock must be a whole number, 0 or more." } }));
    if (!Number.isInteger(threshold) || threshold < 0) return setMsgs((m) => ({ ...m, [r.id]: { tone: "error", text: "Threshold must be a whole number." } }));
    const price = d.price.trim() === "" ? null : Math.round(Number(d.price) * 100);
    if (price !== null && (!Number.isFinite(price) || price < 1)) return setMsgs((m) => ({ ...m, [r.id]: { tone: "error", text: "Price must be a positive amount." } }));
    setSaving(r.id);
    const res = await fetch(`/api/admin/inventory/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: r.version, stock, priceOverride: price, lowStockThreshold: threshold, reason: "manual count" }) });
    const data = await res.json().catch(() => ({}));
    setSaving(null);
    if (res.ok) {
      setRows((rs) => rs.map((x) => (x.id === r.id ? data.row : x)));
      setDrafts((ds) => {
        const { [r.id]: _x, ...rest } = ds;
        return rest;
      });
      setMsgs((m) => ({ ...m, [r.id]: { tone: "success", text: "Saved." } }));
    } else if (res.status === 409 && data?.error?.current) {
      // Show the live numbers and let the admin decide; never overwrite silently.
      setRows((rs) => rs.map((x) => (x.id === r.id ? data.error.current : x)));
      setDrafts((ds) => {
        const { [r.id]: _x, ...rest } = ds;
        return rest;
      });
      setMsgs((m) => ({ ...m, [r.id]: { tone: "error", text: data.error.message } }));
    } else setMsgs((m) => ({ ...m, [r.id]: { tone: "error", text: data?.error?.message ?? "Could not save." } }));
  }

  const input = "min-h-9 w-24 rounded-sm border border-taupe bg-white px-2 text-right text-sm focus:border-maroon";

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <a href={`/api/admin/inventory/export?format=csv${exportQuery}`} className="inline-flex min-h-9 items-center gap-1.5 border border-line bg-white px-3 text-sm hover:border-maroon">
          <Download className="size-4" aria-hidden /> Export CSV
        </a>
        <a href={`/api/admin/inventory/export?format=xlsx${exportQuery}`} className="inline-flex min-h-9 items-center gap-1.5 border border-line bg-white px-3 text-sm hover:border-maroon">
          <Download className="size-4" aria-hidden /> Export Excel
        </a>
        <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)}>
          <Upload className="size-4" aria-hidden /> Import
        </Button>
      </div>

      <div className={tableCls.wrap}>
        <table className="w-full min-w-[56rem] border-collapse text-sm">
          <caption className="sr-only">Inventory by variant. Edit stock, price override or low-stock threshold, then press Save on the row.</caption>
          <thead>
            <tr>
              <th className={tableCls.th} scope="col">SKU</th>
              <th className={tableCls.th} scope="col">Product</th>
              <th className={tableCls.th} scope="col">Variant</th>
              <th className={clsx(tableCls.th, "text-right")} scope="col">On hand</th>
              <th className={clsx(tableCls.th, "text-right")} scope="col">Held</th>
              <th className={clsx(tableCls.th, "text-right")} scope="col">Available</th>
              <th className={clsx(tableCls.th, "text-right")} scope="col">Low at</th>
              <th className={clsx(tableCls.th, "text-right")} scope="col">Price override (INR)</th>
              <th className={tableCls.th} scope="col"><span className="sr-only">Save</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td className={tableCls.td} colSpan={9}>No variants match.</td></tr>
            )}
            {rows.map((r) => {
              const d = draft(r);
              const m = msgs[r.id];
              return (
                <tr key={r.id} className={clsx(dirty(r) && "bg-warning-bg/40")}>
                  <td className={clsx(tableCls.td, "font-mono text-xs")}>{r.sku}</td>
                  <td className={tableCls.td}><Link href={`/admin/products/${r.productId}`} className="text-maroon hover:underline">{r.productName}</Link></td>
                  <td className={tableCls.td}>{r.size} &middot; {r.color}</td>
                  <td className={clsx(tableCls.td, "text-right")}>
                    <label className="sr-only" htmlFor={`st-${r.id}`}>On-hand stock for {r.sku}</label>
                    <input id={`st-${r.id}`} className={input} type="number" min={0} value={d.stock} onChange={(e) => setDrafts((x) => ({ ...x, [r.id]: { ...d, stock: e.target.value } }))} onKeyDown={(e) => e.key === "Enter" && void save(r)} />
                  </td>
                  <td className={clsx(tableCls.td, "text-right")}>{r.reserved}</td>
                  <td className={clsx(tableCls.td, "text-right")}>
                    {r.available === 0 ? <Badge tone="error">0</Badge> : r.isLowStock ? <Badge tone="warning">{r.available}</Badge> : r.available}
                  </td>
                  <td className={clsx(tableCls.td, "text-right")}>
                    <label className="sr-only" htmlFor={`th-${r.id}`}>Low-stock threshold for {r.sku}</label>
                    <input id={`th-${r.id}`} className={clsx(input, "w-16")} type="number" min={0} value={d.threshold} onChange={(e) => setDrafts((x) => ({ ...x, [r.id]: { ...d, threshold: e.target.value } }))} onKeyDown={(e) => e.key === "Enter" && void save(r)} />
                  </td>
                  <td className={clsx(tableCls.td, "text-right")}>
                    <label className="sr-only" htmlFor={`pr-${r.id}`}>Price override for {r.sku}</label>
                    <input id={`pr-${r.id}`} className={clsx(input, "w-28")} type="number" min={1} step="0.01" placeholder="-" value={d.price} onChange={(e) => setDrafts((x) => ({ ...x, [r.id]: { ...d, price: e.target.value } }))} onKeyDown={(e) => e.key === "Enter" && void save(r)} />
                  </td>
                  <td className={tableCls.td}>
                    <div className="flex min-w-[9rem] flex-col gap-1">
                      <Button size="sm" onClick={() => save(r)} loading={saving === r.id} disabled={!dirty(r)}>Save</Button>
                      {m && <p role={m.tone === "error" ? "alert" : "status"} className={clsx("text-xs", m.tone === "error" ? "text-error" : "text-success")}>{m.text}</p>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onDone={() => router.refresh()} />
    </>
  );
}

type PlanRow = Omit<ImportRowResult, "patch">;

function ImportDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [plan, setPlan] = useState<PlanRow[] | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [committed, setCommitted] = useState(false);

  async function send(mode: "dry-run" | "commit") {
    if (!file) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("mode", mode);
    const r = await fetch("/api/admin/inventory/import", { method: "POST", body: fd });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(d?.error?.code === "REAUTH_REQUIRED" ? "For safety, sign out and back in, then repeat the import." : (d?.error?.message ?? "Import failed."));
    setPlan(d.results);
    if (mode === "commit") {
      setCommitted(true);
      setSummary(`Applied ${d.applied} row(s); ${d.skipped} not applied${d.failedChunks ? `; ${d.failedChunks} chunk(s) failed and were rolled back` : ""}. Each chunk of up to 100 rows is atomic; chunks are independent.`);
      onDone();
    } else {
      const ok = d.results.filter((x: PlanRow) => x.status === "ok").length;
      setSummary(`Dry run of ${d.fileRows} row(s): ${ok} will change, ${d.results.length - ok} will not. Nothing has been written.`);
    }
  }
  const okCount = plan?.filter((p) => p.status === "ok").length ?? 0;
  const reset = () => { setFile(null); setPlan(null); setSummary(null); setError(null); setCommitted(false); };

  return (
    <Dialog open={open} onClose={() => { reset(); onClose(); }} title="Import stock and prices" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">
          Export first, edit the file, then upload it. Each row carries the <code>version</code> it was exported at; rows that changed since (for example a sale) are flagged and <strong>not</strong> overwritten. Up to 1,000 rows, 2 MB. Blank price cells are left unchanged; type <code>clear</code> to remove an override.
        </p>
        <div>
          <label htmlFor="imp-file" className="mb-1 block text-sm font-medium">File (.xlsx or .csv)</label>
          <input id="imp-file" type="file" accept=".xlsx,.csv" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPlan(null); setSummary(null); setCommitted(false); }} className="block w-full text-sm" />
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        {summary && <Alert tone={committed ? "success" : "info"}>{summary}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => send("dry-run")} disabled={!file || busy} loading={busy && !plan}>Preview (dry run)</Button>
          <Button onClick={() => send("commit")} disabled={!plan || okCount === 0 || busy || committed}>Apply {okCount} change(s)</Button>
        </div>
        {plan && (
          <div className="max-h-72 overflow-auto rounded-md border border-line">
            <table className="w-full min-w-[34rem] text-left text-xs">
              <thead className="sticky top-0 bg-beige/60">
                <tr><th className="p-2">Row</th><th className="p-2">SKU</th><th className="p-2">Result</th><th className="p-2">Detail</th></tr>
              </thead>
              <tbody>
                {plan.map((p) => (
                  <tr key={p.row} className="border-t border-line/70">
                    <td className="p-2">{p.row}</td>
                    <td className="p-2 font-mono">{p.sku}</td>
                    <td className="p-2"><Badge tone={p.status === "ok" ? "success" : p.status === "unchanged" ? "neutral" : p.status === "conflict" ? "warning" : "error"}>{p.status}</Badge></td>
                    <td className="p-2">{p.status === "ok" && p.before && p.after ? `Stock ${p.before.stock} → ${p.after.stock}` : p.message}{p.status === "ok" && p.before && p.after && p.before.priceOverride !== p.after.priceOverride ? `; price override changes` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Dialog>
  );
}
