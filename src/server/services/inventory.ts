import "server-only";
import ExcelJS from "exceljs";
import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { C, col, chunk, newId, nowIso } from "../repos/common";
import { db } from "../firebase/admin";
import { fromDoc } from "../repos/catalog";
import { audit } from "./audit";
import { invalidate } from "../cache";
import { badRequest, conflict, notFound } from "../http";
import { computeIsLowStock } from "@/domain/product-build";
import { availableUnits, type Variant } from "@/domain/types";

/* ------------------------------------------------------------------ listing */

export interface InventoryRow {
  id: string;
  productId: string;
  productName: string;
  categoryId: string;
  size: string;
  color: string;
  sku: string;
  stock: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  isLowStock: boolean;
  priceOverride: number | null;
  version: number;
  updatedAt: string;
}

const toRow = (v: Variant): InventoryRow => ({ id: v.id, productId: v.productId, productName: v.productName, categoryId: v.categoryId, size: v.size, color: v.color, sku: v.sku, stock: v.stock, reserved: v.reserved, available: availableUnits(v), lowStockThreshold: v.lowStockThreshold, isLowStock: v.isLowStock, priceOverride: v.priceOverride, version: v.version, updatedAt: v.updatedAt });

export interface InventoryQuery {
  filter?: "all" | "low" | "out";
  q?: string;
  categoryId?: string;
  cursor?: string | null;
  limit?: number;
}

/**
 * Variant-level spreadsheet query. Equality filters are indexed (isLowStock, categoryId) and ordering is by SKU so the cursor is
 * stable and unique. "Out of stock" is low-stock rows with zero available (a field-to-field comparison is not a Firestore query).
 * SKU search is a prefix range; if it finds nothing, we fall back to a bounded product-name search.
 */
export async function listInventory(opts: InventoryQuery): Promise<{ rows: InventoryRow[]; nextCursor: string | null }> {
  const limit = Math.min(opts.limit ?? 50, 100);
  const run = async (extra?: (q: FirebaseFirestore.Query) => FirebaseFirestore.Query, order = "sku") => {
    let q: FirebaseFirestore.Query = col(C.variants);
    if (opts.filter === "low" || opts.filter === "out") q = q.where("isLowStock", "==", true);
    if (opts.categoryId) q = q.where("categoryId", "==", opts.categoryId);
    if (extra) q = extra(q);
    q = q.orderBy(order);
    if (opts.cursor && !extra) q = q.startAfter(opts.cursor);
    const snap = await q.limit(limit + 1).get();
    let rows = snap.docs.map((d) => toRow(fromDoc<Variant>(d)));
    if (opts.filter === "out") rows = rows.filter((r) => r.available === 0);
    return { rows, hasMore: snap.size > limit };
  };

  const term = (opts.q ?? "").trim();
  if (term) {
    const up = term.toUpperCase();
    let r = await run((q) => q.where("sku", ">=", up).where("sku", "<=", up + ""));
    if (r.rows.length === 0) {
      // product-name fallback: find product ids by token, then their variants
      const tokens = term.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      const first = tokens[0];
      if (first) {
        const ps = await col(C.products).where("searchTokens", "array-contains", first).limit(30).get();
        const ids = ps.docs.filter((d) => tokens.every((t) => ((d.data() as { searchTokens: string[] }).searchTokens ?? []).some((s) => s.startsWith(t)))).map((d) => d.id);
        if (ids.length) {
          const vs = await col(C.variants).where("productId", "in", ids.slice(0, 30)).get();
          let rows = vs.docs.map((d) => toRow(fromDoc<Variant>(d))).sort((a, b) => a.sku.localeCompare(b.sku));
          if (opts.filter === "low") rows = rows.filter((x) => x.isLowStock);
          if (opts.filter === "out") rows = rows.filter((x) => x.available === 0);
          if (opts.categoryId) rows = rows.filter((x) => x.categoryId === opts.categoryId);
          r = { rows: rows.slice(0, limit), hasMore: false };
        }
      }
    }
    return { rows: r.rows.slice(0, limit), nextCursor: null };
  }
  const r = await run();
  const rows = r.rows.slice(0, limit);
  return { rows, nextCursor: r.hasMore && rows.length ? rows[rows.length - 1]!.sku : null };
}

/* ------------------------------------------------------------------ single update */

export interface VariantPatch {
  stock?: number;
  priceOverride?: number | null; // paise
  lowStockThreshold?: number;
}

/** Apply a patch inside a transaction against an already-read variant. Returns false if nothing changed. */
function applyPatch(tx: Transaction, v: Variant, patch: VariantPatch, reason: string, actor: string): boolean {
  const next = {
    stock: patch.stock ?? v.stock,
    priceOverride: patch.priceOverride === undefined ? v.priceOverride : patch.priceOverride,
    lowStockThreshold: patch.lowStockThreshold ?? v.lowStockThreshold,
  };
  if (next.stock < v.reserved) throw conflict("BELOW_RESERVED", `${v.sku}: ${v.reserved} unit(s) are held by unpaid orders, so on-hand stock cannot go below ${v.reserved} right now.`, { reserved: v.reserved });
  if (next.stock === v.stock && next.priceOverride === v.priceOverride && next.lowStockThreshold === v.lowStockThreshold) return false;
  const now = nowIso();
  const newAvail = Math.max(0, next.stock - v.reserved);
  tx.update(col(C.variants).doc(v.id), {
    stock: next.stock,
    priceOverride: next.priceOverride,
    lowStockThreshold: next.lowStockThreshold,
    isLowStock: computeIsLowStock({ stock: next.stock, reserved: v.reserved, lowStockThreshold: next.lowStockThreshold }),
    version: v.version + 1,
    updatedAt: now,
  });
  const delta = newAvail - availableUnits(v);
  if (delta !== 0) tx.update(col(C.products).doc(v.productId), { availableUnits: FieldValue.increment(delta), updatedAt: now });
  if (next.stock !== v.stock) {
    tx.set(col(C.stockLogs).doc(newId("log_")), { variantId: v.id, productId: v.productId, previousStock: v.stock, newStock: next.stock, delta: next.stock - v.stock, reason, orderId: null, changedBy: actor, changedAt: now });
  }
  return true;
}

/** Inline edit from the spreadsheet. Rejects (409) when the row changed since the admin loaded it - e.g. a sale landed meanwhile. */
export async function updateVariant(variantId: string, expectedVersion: number, patch: VariantPatch, reason: string, actor: string): Promise<InventoryRow> {
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(col(C.variants).doc(variantId));
    if (!snap.exists) throw notFound("Variant not found.");
    const v = fromDoc<Variant>(snap);
    if (v.version !== expectedVersion) {
      throw conflict("VERSION_CONFLICT", `${v.sku} changed since you loaded it (now ${v.stock} on hand, ${v.reserved} held). Review the new numbers and try again.`, { current: toRow(v) });
    }
    applyPatch(tx, v, patch, reason, actor);
  });
  invalidate("catalog");
  return toRow(fromDoc<Variant>(await col(C.variants).doc(variantId).get()));
}

/* ------------------------------------------------------------------ export */

const HEADERS = ["sku", "product", "size", "color", "stock", "reserved", "available", "low_stock_threshold", "price_override_inr", "version"] as const;

/** Spreadsheet formula-injection defence: cells that start with = + - @ TAB or CR are prefixed with an apostrophe. */
export function safeCell(v: string | number | null): string | number {
  if (v === null) return "";
  if (typeof v === "number") return v;
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}
const unsafeCell = (s: string) => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s);

export async function exportRows(opts: InventoryQuery): Promise<InventoryRow[]> {
  const all: InventoryRow[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 50; i++) {
    const r = await listInventory({ ...opts, cursor, limit: 100 });
    all.push(...r.rows);
    if (!r.nextCursor || all.length >= 5000) break;
    cursor = r.nextCursor;
  }
  return all;
}

const toRecord = (r: InventoryRow) => [r.sku, r.productName, r.size, r.color, r.stock, r.reserved, r.available, r.lowStockThreshold, r.priceOverride == null ? "" : r.priceOverride / 100, r.version];

export function rowsToCsv(rows: InventoryRow[]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [HEADERS.join(",")];
  for (const r of rows) lines.push(toRecord(r).map((v) => esc(safeCell(v as string | number))).join(","));
  return lines.join("\r\n") + "\r\n";
}

export async function rowsToXlsx(rows: InventoryRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Inventory");
  ws.addRow([...HEADERS]);
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(toRecord(r).map((v) => safeCell(v as string | number)));
  ws.columns.forEach((c) => (c.width = 18));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* ------------------------------------------------------------------ import */

export const IMPORT_MAX_ROWS = 1000;
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
const COMMIT_CHUNK = 100;

export interface ImportRowResult {
  row: number; // 1-based spreadsheet row (header = 1)
  sku: string;
  status: "ok" | "unchanged" | "error" | "conflict";
  message: string;
  before?: { stock: number; priceOverride: number | null; lowStockThreshold: number };
  after?: { stock: number; priceOverride: number | null; lowStockThreshold: number };
  patch?: VariantPatch;
  variantId?: string;
  expectedVersion?: number;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') (cur += '"', i++);
        else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") (row.push(cur), (cur = ""));
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

async function readTable(buf: Buffer, filename: string): Promise<string[][]> {
  if (buf.length > IMPORT_MAX_BYTES) throw badRequest("The file is too large (max 2 MB).");
  if (/\.csv$/i.test(filename)) return parseCsv(buf.toString("utf8").replace(/^﻿/, ""));
  if (!/\.xlsx$/i.test(filename)) throw badRequest("Upload an .xlsx or .csv file exported from this page.");
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw badRequest("That file could not be read as an Excel workbook.");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw badRequest("The workbook has no sheets.");
  const out: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (r) => {
    const vals = (r.values as unknown[]).slice(1).map((c) => {
      if (c == null) return "";
      if (typeof c === "object" && "result" in (c as object)) return String((c as { result: unknown }).result ?? "");
      if (typeof c === "object" && "text" in (c as object)) return String((c as { text: unknown }).text ?? "");
      return String(c);
    });
    out.push(vals);
  });
  return out;
}

/**
 * Build a plan for an import file WITHOUT writing anything (dry run). Each row must carry the `version` it was exported at;
 * a row whose variant has changed since (a sale, another edit) is reported as a conflict and will not be applied.
 */
export async function planImport(buf: Buffer, filename: string): Promise<{ results: ImportRowResult[]; fileRows: number }> {
  const table = await readTable(buf, filename);
  if (table.length < 2) throw badRequest("The file has no data rows.");
  if (table.length - 1 > IMPORT_MAX_ROWS) throw badRequest(`Too many rows (${table.length - 1}). The limit is ${IMPORT_MAX_ROWS} per file.`);
  const header = table[0]!.map((h) => h.trim().toLowerCase());
  const idx = (n: string) => header.indexOf(n);
  for (const required of ["sku", "stock", "version"]) if (idx(required) === -1) throw badRequest(`Missing required column "${required}". Export a fresh file from this page and edit that.`);

  const results: ImportRowResult[] = [];
  const seen = new Set<string>();
  const parsed: { row: number; sku: string; stock: number | null; price: number | null | undefined; threshold: number | null; version: number }[] = [];
  table.slice(1).forEach((cells, i) => {
    const rowNo = i + 2;
    const get = (n: string) => (idx(n) === -1 ? "" : unsafeCell((cells[idx(n)] ?? "").toString().trim()));
    const sku = get("sku").toUpperCase();
    const fail = (msg: string) => results.push({ row: rowNo, sku: sku || "(blank)", status: "error", message: msg });
    if (!sku) return fail("SKU is blank.");
    if (!/^[A-Z0-9][A-Z0-9._-]{2,39}$/.test(sku)) return fail("SKU contains invalid characters.");
    if (seen.has(sku)) return fail("Duplicate SKU in this file.");
    seen.add(sku);
    const stockRaw = get("stock");
    const stock = stockRaw === "" ? null : Number(stockRaw);
    if (stock !== null && (!Number.isInteger(stock) || stock < 0 || stock > 100_000)) return fail("Stock must be a whole number between 0 and 100,000.");
    const version = Number(get("version"));
    if (!Number.isInteger(version) || version < 1) return fail("Version is missing. Re-export the file so versions can protect against stale edits.");
    const pRaw = get("price_override_inr");
    let price: number | null | undefined;
    if (idx("price_override_inr") === -1 || pRaw === "") price = undefined;
    else if (pRaw.toLowerCase() === "clear") price = null;
    else {
      const n = Number(pRaw);
      if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) return fail("Price override must be a positive amount in rupees, blank (unchanged), or the word clear.");
      price = Math.round(n * 100);
    }
    const tRaw = get("low_stock_threshold");
    const threshold = idx("low_stock_threshold") === -1 || tRaw === "" ? null : Number(tRaw);
    if (threshold !== null && (!Number.isInteger(threshold) || threshold < 0 || threshold > 1000)) return fail("Low-stock threshold must be a whole number 0-1000.");
    parsed.push({ row: rowNo, sku, stock, price, threshold, version });
  });

  // resolve SKUs -> variant ids -> variants (bounded reads)
  const keys = await Promise.all(parsed.map((p) => col(C.uniqueKeys).doc(`sku:${p.sku}`).get()));
  const idFor = new Map<string, string>();
  keys.forEach((k, i) => k.exists && idFor.set(parsed[i]!.sku, (k.data() as { id: string }).id));
  const variants = new Map<string, Variant>();
  for (const group of chunk([...new Set(idFor.values())], 100)) {
    if (!group.length) continue;
    const snaps = await db().getAll(...group.map((id) => col(C.variants).doc(id)));
    snaps.forEach((s) => s.exists && variants.set(s.id, fromDoc<Variant>(s)));
  }

  for (const p of parsed) {
    const vid = idFor.get(p.sku);
    const v = vid ? variants.get(vid) : undefined;
    if (!v) {
      results.push({ row: p.row, sku: p.sku, status: "error", message: "No variant with this SKU. New variants are created in the product editor." });
      continue;
    }
    const before = { stock: v.stock, priceOverride: v.priceOverride, lowStockThreshold: v.lowStockThreshold };
    if (v.version !== p.version) {
      results.push({ row: p.row, sku: p.sku, status: "conflict", message: `Changed since export (file version ${p.version}, now ${v.version}; stock is now ${v.stock}). Re-export and re-apply your edit.`, before, variantId: v.id });
      continue;
    }
    const patch: VariantPatch = {};
    if (p.stock !== null) patch.stock = p.stock;
    if (p.price !== undefined) patch.priceOverride = p.price;
    if (p.threshold !== null) patch.lowStockThreshold = p.threshold;
    const after = { stock: patch.stock ?? v.stock, priceOverride: patch.priceOverride === undefined ? v.priceOverride : patch.priceOverride, lowStockThreshold: patch.lowStockThreshold ?? v.lowStockThreshold };
    if (after.stock < v.reserved) {
      results.push({ row: p.row, sku: p.sku, status: "error", message: `${v.reserved} unit(s) are held by unpaid orders; stock cannot be set below that.`, before, variantId: v.id });
      continue;
    }
    if (JSON.stringify(before) === JSON.stringify(after)) {
      results.push({ row: p.row, sku: p.sku, status: "unchanged", message: "No change.", before, after, variantId: v.id });
      continue;
    }
    results.push({ row: p.row, sku: p.sku, status: "ok", message: "Will be updated.", before, after, patch, variantId: v.id, expectedVersion: p.version });
  }
  results.sort((a, b) => a.row - b.row);
  return { results, fileRows: table.length - 1 };
}

/**
 * Apply an import. The plan is recomputed from the uploaded file (nothing from the dry run is trusted), then applied in
 * chunks of 100 rows, each chunk one transaction (<= 100 rows x 3 writes < the 500-write limit). Within a chunk every row is
 * version-checked again; a row that changed in the meantime is skipped and reported. Honest outcome: rows applied / skipped / failed
 * chunks - never a claim of global atomicity across chunks.
 */
export async function commitImport(buf: Buffer, filename: string, actor: string): Promise<{ applied: number; skipped: number; failedChunks: number; results: ImportRowResult[] }> {
  const { results } = await planImport(buf, filename);
  const todo = results.filter((r) => r.status === "ok");
  let applied = 0;
  let failedChunks = 0;
  for (const group of chunk(todo, COMMIT_CHUNK)) {
    try {
      const outcome = await db().runTransaction(async (tx) => {
        const snaps = await tx.getAll(...group.map((r) => col(C.variants).doc(r.variantId!)));
        const done: { row: number; ok: boolean; msg: string }[] = [];
        snaps.forEach((s, i) => {
          const r = group[i]!;
          const v = s.exists ? fromDoc<Variant>(s) : null;
          if (!v || v.version !== r.expectedVersion) return done.push({ row: r.row, ok: false, msg: "Changed while importing (a sale or another edit landed). Not applied." });
          try {
            applyPatch(tx, v, r.patch!, `inventory import ${filename.slice(0, 60)}`, actor);
            done.push({ row: r.row, ok: true, msg: "Updated." });
          } catch (e) {
            done.push({ row: r.row, ok: false, msg: e instanceof Error ? e.message : "Not applied." });
          }
        });
        return done;
      });
      for (const o of outcome) {
        const res = results.find((x) => x.row === o.row)!;
        if (o.ok) (applied++, (res.message = o.msg));
        else ((res.status = "conflict"), (res.message = o.msg));
      }
    } catch (e) {
      failedChunks++;
      for (const r of group) {
        r.status = "error";
        r.message = `Chunk failed and was rolled back: ${e instanceof Error ? e.message : "unknown error"}`;
      }
    }
  }
  await audit(actor, "inventory.import", filename.slice(0, 80), { applied, planned: todo.length, failedChunks, rows: results.length });
  if (applied) invalidate("catalog");
  return { applied, skipped: results.length - applied, failedChunks, results };
}
