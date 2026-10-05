import "server-only";
import { C, col, nowIso } from "../repos/common";
import { db } from "../firebase/admin";
import { addTimeline, orderFromDoc, orderRef } from "./order-core";
import { enqueueNotification } from "./notifications";
import { auditInTx } from "./audit";
import { payments, ProviderError, type ProviderRefund } from "../providers/payments";
import { badRequest, conflict, notFound } from "../http";
import { canRetry, matchByReceipt, receiptFor, refundTotals, type DispatchOutcome, type RefundObservation } from "@/domain/refunds";
import type { Order, RefundRecord } from "@/domain/types";

/**
 * Refund dispatch, recovery and reconciliation.
 *
 * Invariants (each has a regression test in tests/integration/refund-recovery.test.ts):
 *  1. Before ANY provider call a durable dispatch record (orders/{id}/refundDispatches/{refundId}_{attempt}) is written in the
 *     same transaction that locks the refund as `processing`. A crash after that point leaves evidence of what was attempted.
 *  2. `processing` is never unlocked by elapsed time. It resolves only through verified provider evidence (fetch by id, list by
 *     receipt + payment + exact amount, or an authenticated webhook) or an audited manual attestation after a failed system search.
 *  3. `completed` is terminal. Duplicate and out-of-order events never change totals twice.
 *  4. Events that cannot yet be correlated are kept as evidence (refundEvidence) and replayed once the refund id is known.
 *  5. Amount alone is never a match key.
 */

const dispatchCol = (orderId: string) => orderRef(orderId).collection("refundDispatches");
const evidenceCol = (orderId: string) => orderRef(orderId).collection("refundEvidence");
const dispatchId = (refundId: string, attempt: number) => `${refundId}_${attempt}`;
const unmatchedCol = () => col("unmatchedRefundEvidence");

export interface RefundDispatch {
  refundId: string;
  attempt: number;
  orderId: string;
  paymentId: string;
  amount: number;
  receipt: string;
  outcome: DispatchOutcome;
  providerRefundId: string | null;
  providerStatus: string | null;
  startedAt: string;
  startedBy: string;
  updatedAt: string;
  lastError?: string | null;
  lastCheck?: { at: string; by: string; result: string; detail: string } | null;
  attestation?: { by: string; at: string; note: string } | null;
}

export interface RefundEvidence {
  providerRefundId: string;
  paymentId: string;
  amount: number;
  receipt: string | null;
  status: "pending" | "processed" | "failed";
  state: "unresolved" | "applied" | "mismatch" | "superseded_attempt" | "ignored_stale";
  note: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  sources: string[];
}

/** Totals and flags derived from the refund list; the single place order refund fields are computed. */
export function refundPatch(o: Order, refunds: RefundRecord[]): Record<string, unknown> {
  const t = refundTotals(refunds);
  const paymentStatus = t.completed >= o.pricing.total ? "refunded" : t.completed > 0 ? "partially_refunded" : o.paymentStatus;
  return { "payment.refunds": refunds, "payment.refundedTotal": t.completed, "payment.refundsPending": t.pending, paymentStatus };
}

const short = (e: unknown): string => (e instanceof Error ? e.message : "Provider error").slice(0, 200);

/* ------------------------------------------------------------------ dispatch */

/**
 * Send a requested (or provably retry-safe failed) refund to the provider.
 *  1. one transaction: validate caps, lock the refund `processing`, persist the dispatch record (receipt = stable identity);
 *  2. call the provider OUTSIDE the transaction;
 *  3. one transaction: record the verified outcome. Only a definitive provider rejection returns the refund to `failed/retry-safe`;
 *     a timeout, dropped connection, 5xx or crash stays `processing` + `uncertain` until recovery proves what happened.
 */
export async function executeRefund(orderId: string, refundId: string, actor: string): Promise<Order> {
  const pre = await db().runTransaction(async (tx) => {
    const snap = await tx.get(orderRef(orderId));
    if (!snap.exists) throw notFound("Order not found.");
    const o = orderFromDoc(snap);
    const r = o.payment.refunds.find((x) => x.id === refundId);
    if (!r) throw notFound("Refund not found.");
    if (o.paymentMethod !== "razorpay" && !r.exceptionId) throw badRequest("Cash-on-delivery refunds are recorded manually (bank transfer / UPI reference), not sent through a provider.");
    const paymentId = r.paymentId ?? o.payment.razorpayPaymentId;
    if (!paymentId) throw conflict("NO_PAYMENT", "There is no captured payment to refund.");
    const verdict = canRetry(r);
    if (!verdict.ok) {
      const msg: Record<typeof verdict.reason, [string, string]> = {
        completed: ["ALREADY_DONE", "This refund is already completed."],
        in_progress: ["IN_PROGRESS", "This refund is in progress or awaiting reconciliation. Do not send it again."],
        uncertain: ["IN_PROGRESS", "This refund's outcome is unknown. It stays locked until it is reconciled with the payment provider. Use Reconcile with provider."],
        not_retry_safe: ["RETRY_NOT_SAFE", "This refund failed but it is not proven that the provider created no refund. Reconcile it with the provider first."],
        attempts_exhausted: ["ATTEMPTS_EXHAUSTED", "This refund has been attempted the maximum number of times. Check the payment provider dashboard."],
      };
      throw conflict(msg[verdict.reason][0], msg[verdict.reason][1]);
    }
    // Cap re-check at send time (a failed refund no longer counts as "open", so another request may have used the headroom).
    const others = o.payment.refunds.filter((x) => x.id !== r.id && (x.state === "completed" || x.state === "processing" || x.state === "requested") && !!x.exceptionId === !!r.exceptionId && (x.exceptionId ?? "") === (r.exceptionId ?? ""));
    const used = others.reduce((s, x) => s + x.amount, 0);
    let ceiling = o.pricing.total;
    if (r.exceptionId) {
      const ex = await tx.get(orderRef(orderId).collection("paymentExceptions").doc(r.exceptionId));
      if (!ex.exists) throw conflict("NO_EXCEPTION", "The payment exception for this refund no longer exists.");
      ceiling = (ex.data() as { amount: number }).amount;
    }
    if (used + r.amount > ceiling) throw conflict("OVER_REFUND", "Sending this refund would exceed the amount that can be refunded.");

    const attempt = (r.attempt ?? 0) + 1;
    const receipt = receiptFor(r.id, attempt);
    const now = nowIso();
    const refunds = o.payment.refunds.map((x) => (x.id === r.id ? { ...x, state: "processing" as const, receipt, attempt, paymentId, uncertain: false, retrySafe: false, updatedAt: now } : x));
    tx.update(orderRef(orderId), { ...refundPatch(o, refunds), updatedAt: now, version: o.version + 1 });
    const d: RefundDispatch = { refundId: r.id, attempt, orderId, paymentId, amount: r.amount, receipt, outcome: "intent", providerRefundId: null, providerStatus: null, startedAt: now, startedBy: actor, updatedAt: now, lastError: null, lastCheck: null, attestation: null };
    tx.create(dispatchCol(orderId).doc(dispatchId(r.id, attempt)), d);
    auditInTx(tx, actor, "refund.execute.start", orderId, { refundId, attempt, receipt, amount: r.amount });
    return { paymentId, refund: r, attempt, receipt, order: o };
  });

  let result: ProviderRefund | null = null;
  let failure: ProviderError | Error | null = null;
  try {
    result = await payments().refund({ paymentId: pre.paymentId, amount: pre.refund.amount, receipt: pre.receipt, notes: { orderNumber: pre.order.orderNumber, refundId: pre.refund.id } });
  } catch (e) {
    failure = e instanceof Error ? e : new Error("Provider error");
  }

  const rejected = failure instanceof ProviderError && failure.kind === "rejected";
  const anomaly = !!result && (result.paymentId !== pre.paymentId || result.amount !== pre.refund.amount);

  const final = await db().runTransaction(async (tx) => {
    const dRef = dispatchCol(orderId).doc(dispatchId(pre.refund.id, pre.attempt));
    const [snap, dSnap] = await Promise.all([tx.get(orderRef(orderId)), tx.get(dRef)]);
    const o = orderFromDoc(snap);
    const cur = o.payment.refunds.find((x) => x.id === pre.refund.id);
    const now = nowIso();
    if (!cur) return { order: o, state: "failed" as const };
    let state: RefundRecord["state"];
    let patchRec: Partial<RefundRecord>;
    let outcome: DispatchOutcome;
    let label: string;
    let detail: string | null = null;
    let review = false;
    if (result && !anomaly) {
      state = result.status === "processed" ? "completed" : result.status === "failed" ? "failed" : "processing";
      patchRec = { providerRefundId: result.id, uncertain: false, retrySafe: result.status === "failed" };
      outcome = result.status === "processed" ? "provider_processed" : result.status === "failed" ? "provider_failed" : "accepted";
      label = state === "completed" ? "Refund completed" : state === "failed" ? "Refund attempt failed at the provider" : "Refund accepted by the provider and being processed";
    } else if (rejected) {
      state = "failed";
      patchRec = { uncertain: false, retrySafe: true };
      outcome = "rejected";
      label = "Refund rejected by the provider";
      detail = short(failure);
    } else {
      // Timeout / dropped connection / 5xx / duplicate-receipt / unexpected response: the provider MAY have moved money.
      state = "processing";
      patchRec = { uncertain: true, retrySafe: false, providerRefundId: anomaly ? (result?.id ?? null) : cur.providerRefundId };
      outcome = "unknown";
      review = true;
      label = "Refund outcome unknown - locked for reconciliation";
      detail = anomaly ? "The provider response did not match the requested payment/amount." : short(failure);
    }
    // A webhook may have settled the refund while the provider call was still in flight; completed is terminal.
    const refunds = o.payment.refunds.map((x) => (x.id === pre.refund.id ? (x.state === "completed" ? { ...x, providerRefundId: x.providerRefundId ?? result?.id ?? null } : { ...x, ...patchRec, state, updatedAt: now }) : x));
    const patch: Record<string, unknown> = { ...refundPatch(o, refunds), updatedAt: now, version: o.version + 1 };
    if (review) patch.needsReview = true;
    if (state === "completed" && !cur.exceptionId && o.returnStatus === "refund_pending") patch.returnStatus = "closed";
    tx.update(orderRef(orderId), patch);
    if (dSnap.exists) tx.update(dRef, { outcome: (dSnap.data() as RefundDispatch).outcome === "provider_processed" ? "provider_processed" : outcome, providerRefundId: result?.id ?? null, providerStatus: result?.status ?? null, lastError: failure ? short(failure) : null, updatedAt: now });
    addTimeline(tx, orderId, { type: `refund.${state}`, label, detail, customerVisible: state === "completed" || (state === "processing" && !review), actor });
    auditInTx(tx, actor, `refund.execute.${outcome}`, orderId, { refundId: pre.refund.id, attempt: pre.attempt, providerRefundId: result?.id ?? null });
    if (state === "completed" && cur.exceptionId) tx.update(orderRef(orderId).collection("paymentExceptions").doc(cur.exceptionId), { status: "refunded", resolvedAt: now, updatedAt: now });
    return { order: o, state };
  });

  if (result && !anomaly) await settleEvidence(orderId, result.id);
  const after = orderFromDoc(await orderRef(orderId).get());
  const cur = after.payment.refunds.find((x) => x.id === pre.refund.id);
  if (rejected) throw badRequest(`The payment provider rejected this refund: ${short(failure)}. Nothing was refunded; you can correct the problem and send it again.`);
  if (!result || anomaly) throw conflict("REFUND_UNCERTAIN", "The refund outcome is unknown. It remains locked for reconciliation; use Reconcile with provider before taking further action.");
  if (final.state !== "failed" && cur) {
    await enqueueNotification({ kind: "order.refund", to: { email: after.contact.email, phone: after.contact.phone }, data: { orderNumber: after.orderNumber, state: cur.state === "completed" ? "completed" : "processing" }, dedupeKey: `refund_${pre.refund.id}` });
  }
  return after;
}

/* ------------------------------------------------------------------ observations (webhook / fetch / list / replay) */

export type ObservationResult = "completed" | "failed_confirmed" | "pending_at_provider" | "evidence_kept" | "mismatch" | "superseded" | "ignored" | "noop";

type ObsSource = "webhook" | "fetch" | "list" | "evidence_replay";

/**
 * Apply one VERIFIED provider observation of a refund (authenticated webhook body, a direct provider fetch, a provider list
 * entry or a replayed piece of evidence). Correlation order: provider refund id, then our receipt (adoption) - always with the
 * payment id and the exact amount checked. Anything that cannot be correlated is retained as evidence, never dropped or guessed.
 */
export async function applyRefundObservation(orderId: string, obs: RefundObservation, source: ObsSource, actor = "provider"): Promise<ObservationResult> {
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(orderRef(orderId));
    if (!snap.exists) return "noop";
    const o = orderFromDoc(snap);
    const now = nowIso();
    let idx = o.payment.refunds.findIndex((r) => r.providerRefundId === obs.providerRefundId);
    let adopted = false;
    if (idx < 0 && obs.receipt) {
      idx = o.payment.refunds.findIndex((r) => r.receipt === obs.receipt && !r.providerRefundId && r.state === "processing");
      adopted = idx >= 0;
    }
    const evRef = evidenceCol(orderId).doc(obs.providerRefundId);
    const rec = idx >= 0 ? o.payment.refunds[idx]! : null;
    const dRef = rec?.attempt ? dispatchCol(orderId).doc(dispatchId(rec.id, rec.attempt)) : null;
    const [evSnap, dSnap, supersededQ] = await Promise.all([
      tx.get(evRef),
      dRef ? tx.get(dRef) : Promise.resolve(null),
      !rec && obs.receipt ? tx.get(dispatchCol(orderId).where("receipt", "==", obs.receipt).limit(1)) : Promise.resolve(null),
    ]);
    const prev = evSnap.exists ? (evSnap.data() as RefundEvidence) : null;
    const keepEvidence = (state: RefundEvidence["state"], note: string | null) => {
      // processed is never overwritten by a later failed/pending observation of the same refund
      const status = prev?.status === "processed" ? "processed" : obs.status;
      const e: RefundEvidence = { providerRefundId: obs.providerRefundId, paymentId: obs.paymentId, amount: obs.amount, receipt: obs.receipt, status, state, note, firstSeenAt: prev?.firstSeenAt ?? now, lastSeenAt: now, sources: [...new Set([...(prev?.sources ?? []), source])].slice(0, 8) };
      tx.set(evRef, e);
    };

    if (!rec) {
      if (supersededQ && !supersededQ.empty) {
        // Money moved for an attempt we had already declared absent/failed: this is an extra refund. Never auto-resolve it.
        keepEvidence("superseded_attempt", "A provider refund exists for an earlier attempt that was recorded as not created. Check the provider dashboard and the refund caps.");
        tx.update(orderRef(orderId), { needsReview: true, updatedAt: now, version: o.version + 1 });
        addTimeline(tx, orderId, { type: "refund.superseded_attempt", label: "Provider refund found for an earlier refund attempt - manual review required", detail: obs.providerRefundId, customerVisible: false, actor });
        auditInTx(tx, actor, "refund.superseded_attempt", orderId, { providerRefundId: obs.providerRefundId });
        return "superseded";
      }
      keepEvidence("unresolved", null);
      return "evidence_kept";
    }

    const expectedPayment = rec.paymentId ?? o.payment.razorpayPaymentId;
    if (obs.paymentId !== expectedPayment || obs.amount !== rec.amount) {
      keepEvidence("mismatch", `Provider refund ${obs.providerRefundId} (payment ${obs.paymentId}, ${obs.amount}) does not match the recorded refund (payment ${expectedPayment}, ${rec.amount}).`);
      tx.update(orderRef(orderId), { needsReview: true, updatedAt: now, version: o.version + 1 });
      addTimeline(tx, orderId, { type: "refund.mismatch", label: "A provider refund event did not match the recorded refund - manual review required", detail: obs.providerRefundId, customerVisible: false, actor });
      auditInTx(tx, actor, "refund.mismatch", orderId, { providerRefundId: obs.providerRefundId, refundId: rec.id });
      return "mismatch";
    }

    // Terminal states: completed is final; a duplicate "failed" for an already failed refund changes nothing.
    if (rec.state === "completed") {
      if (obs.status === "failed") {
        keepEvidence("ignored_stale", "A failed event arrived after the refund was completed; totals were not changed.");
        return "ignored";
      }
      if (prev && prev.state === "unresolved") keepEvidence("applied", null);
      return "noop";
    }
    if (rec.state === "failed" && obs.status !== "processed") {
      // already failed. If this adopted by receipt it still records the id so a retry can't lose track of it.
      if (!rec.providerRefundId && obs.providerRefundId) {
        const refunds = o.payment.refunds.map((r, i) => (i === idx ? { ...r, providerRefundId: obs.providerRefundId, updatedAt: now } : r));
        tx.update(orderRef(orderId), { "payment.refunds": refunds, updatedAt: now });
      }
      return "noop";
    }
    if (rec.state === "requested") {
      // Never dispatched by us yet the provider reports it: treat as mismatch, do not complete.
      keepEvidence("mismatch", "The provider reports a refund that was never dispatched from this system.");
      tx.update(orderRef(orderId), { needsReview: true, updatedAt: now, version: o.version + 1 });
      return "mismatch";
    }

    const next: RefundRecord["state"] = obs.status === "processed" ? "completed" : obs.status === "failed" ? "failed" : "processing";
    const refunds = o.payment.refunds.map((r, i) => (i === idx ? { ...r, providerRefundId: obs.providerRefundId, state: next, uncertain: false, retrySafe: next === "failed", updatedAt: now } : r));
    const patch: Record<string, unknown> = { ...refundPatch(o, refunds), updatedAt: now, version: o.version + 1 };
    if (next === "completed" && !rec.exceptionId && o.returnStatus === "refund_pending") patch.returnStatus = "closed";
    tx.update(orderRef(orderId), patch);
    if (dRef && dSnap?.exists) tx.update(dRef, { outcome: obs.status === "processed" ? "provider_processed" : obs.status === "failed" ? "provider_failed" : "accepted", providerRefundId: obs.providerRefundId, providerStatus: obs.status, updatedAt: now });
    if (next === "completed" && rec.exceptionId) tx.update(orderRef(orderId).collection("paymentExceptions").doc(rec.exceptionId), { status: "refunded", resolvedAt: now, updatedAt: now });
    if (prev) keepEvidence("applied", adopted ? "Adopted by receipt." : null);
    addTimeline(tx, orderId, {
      type: `refund.${next}`,
      label: next === "completed" ? "Refund completed" : next === "failed" ? "Refund failed at the provider" : "Refund accepted by the provider and being processed",
      detail: `${obs.providerRefundId} (${source}${adopted ? ", matched by receipt" : ""})`,
      customerVisible: next !== "failed",
      actor,
    });
    auditInTx(tx, actor, `refund.observed.${next}`, orderId, { refundId: rec.id, providerRefundId: obs.providerRefundId, source, adopted });
    return next === "completed" ? "completed" : next === "failed" ? "failed_confirmed" : "pending_at_provider";
  });
}

/** Replay any retained evidence for a refund id once the refund has been correlated. */
export async function settleEvidence(orderId: string, providerRefundId: string): Promise<ObservationResult | null> {
  const ev = await evidenceCol(orderId).doc(providerRefundId).get();
  if (!ev.exists) return null;
  const e = ev.data() as RefundEvidence;
  if (e.state !== "unresolved") return null;
  return applyRefundObservation(orderId, { providerRefundId: e.providerRefundId, paymentId: e.paymentId, amount: e.amount, status: e.status, receipt: e.receipt }, "evidence_replay");
}

/** Replay every unresolved evidence entry of an order (used after a refund is adopted by reconciliation). */
export async function replayUnresolvedEvidence(orderId: string): Promise<number> {
  const q = await evidenceCol(orderId).where("state", "==", "unresolved").limit(25).get();
  let n = 0;
  for (const d of q.docs) if ((await settleEvidence(orderId, d.id)) && (await evidenceCol(orderId).doc(d.id).get()).data()?.state !== "unresolved") n++;
  return n;
}

const toObs = (r: ProviderRefund): RefundObservation => ({ providerRefundId: r.id, paymentId: r.paymentId, amount: r.amount, status: r.status, receipt: r.receipt ?? null });

/**
 * Entry point for authenticated `refund.processed` / `refund.failed` webhooks. Finds the order by the payment id the event
 * names (the order's own capture, or a payment-exception capture). If no order owns that payment the event is kept in
 * `unmatchedRefundEvidence` for review rather than dropped.
 * The 3-argument form is kept for callers that only know id/status; amount/receipt come from the stored refund when present.
 */
export async function applyRefundEvent(paymentId: string, providerRefundId: string, status: "processed" | "failed", extra?: { amount?: number; receipt?: string | null }): Promise<ObservationResult> {
  let q = await col(C.orders).where("payment.razorpayPaymentId", "==", paymentId).limit(1).get();
  if (q.empty) q = await col(C.orders).where("payment.exceptionPaymentIds", "array-contains", paymentId).limit(1).get();
  const doc = q.docs[0];
  if (!doc) {
    await unmatchedCol().doc(providerRefundId).set({ providerRefundId, paymentId, amount: extra?.amount ?? null, receipt: extra?.receipt ?? null, status, state: "unmatched", receivedAt: nowIso() }, { merge: true });
    return "evidence_kept";
  }
  const o = orderFromDoc(doc);
  const known = o.payment.refunds.find((r) => r.providerRefundId === providerRefundId);
  const amount = extra?.amount ?? known?.amount ?? -1;
  return applyRefundObservation(o.id, { providerRefundId, paymentId, amount, status, receipt: extra?.receipt ?? known?.receipt ?? null }, "webhook");
}

/* ------------------------------------------------------------------ recovery */

export type ReconcileOutcome =
  | "completed"
  | "failed_confirmed"
  | "pending_at_provider"
  | "not_found"
  | "ambiguous"
  | "mismatch"
  | "provider_unavailable"
  | "not_pending";

export interface ReconcileReport {
  outcome: ReconcileOutcome;
  detail: string;
}

/**
 * Ask the provider what really happened to a `processing` refund and apply ONLY what is proven:
 *  - known provider id  -> fetch it, check payment + amount, apply its status;
 *  - unknown id         -> list the payment's refunds and match OUR receipt (+ payment + exact amount);
 *  - nothing found      -> stays locked (absence in a list is not proof; a person must check the provider dashboard and attest).
 */
export async function reconcileRefund(orderId: string, refundId: string, actor: string): Promise<ReconcileReport> {
  const snap = await orderRef(orderId).get();
  if (!snap.exists) throw notFound("Order not found.");
  const o = orderFromDoc(snap);
  const r = o.payment.refunds.find((x) => x.id === refundId);
  if (!r) throw notFound("Refund not found.");
  if (r.state !== "processing") return { outcome: "not_pending", detail: "This refund is not awaiting reconciliation." };
  const paymentId = r.paymentId ?? o.payment.razorpayPaymentId;
  if (!paymentId || !r.receipt || !r.attempt) return { outcome: "ambiguous", detail: "This refund has no dispatch record (it predates dispatch tracking). Check the payment provider dashboard." };
  const dRef = dispatchCol(orderId).doc(dispatchId(r.id, r.attempt));
  const record = async (result: string, detail: string) => {
    await dRef.set({ lastCheck: { at: nowIso(), by: actor, result, detail: detail.slice(0, 300) }, updatedAt: nowIso() }, { merge: true });
  };
  let report: ReconcileReport;
  try {
    if (r.providerRefundId) {
      const obs = toObs(await payments().fetchRefund(paymentId, r.providerRefundId));
      const res = await applyRefundObservation(orderId, obs, "fetch", actor);
      report = res === "completed" ? { outcome: "completed", detail: "The provider confirms the refund was processed." } : res === "failed_confirmed" ? { outcome: "failed_confirmed", detail: "The provider confirms the refund failed. It can be sent again." } : res === "mismatch" ? { outcome: "mismatch", detail: "The provider's refund does not match the recorded payment/amount. Manual review required." } : { outcome: "pending_at_provider", detail: "The provider has the refund and is still processing it." };
    } else {
      const list = (await payments().listPaymentRefunds(paymentId)).map(toObs);
      const m = matchByReceipt(list, { receipt: r.receipt, paymentId, amount: r.amount });
      if (m.kind === "match") {
        const res = await applyRefundObservation(orderId, m.observation, "list", actor);
        await replayUnresolvedEvidence(orderId);
        report = res === "completed" ? { outcome: "completed", detail: `Found ${m.observation.providerRefundId} at the provider; it is processed.` } : res === "failed_confirmed" ? { outcome: "failed_confirmed", detail: `Found ${m.observation.providerRefundId} at the provider; it failed. It can be sent again.` } : { outcome: "pending_at_provider", detail: `Found ${m.observation.providerRefundId} at the provider; it is still processing.` };
      } else if (m.kind === "none") {
        const similar = list.filter((x) => x.amount === r.amount && !o.payment.refunds.some((q) => q.providerRefundId === x.providerRefundId)).length;
        report = { outcome: "not_found", detail: `No provider refund carries receipt ${r.receipt}. This is not proof that none exists${similar ? `; ${similar} unclaimed refund(s) of the same amount exist and were NOT matched` : ""}. Check the provider dashboard before recording a manual check.` };
      } else {
        report = { outcome: m.kind === "ambiguous" ? "ambiguous" : "mismatch", detail: m.reason };
        await db().runTransaction(async (tx) => {
          const cur = orderFromDoc(await tx.get(orderRef(orderId)));
          tx.update(orderRef(orderId), { needsReview: true, updatedAt: nowIso(), version: cur.version + 1 });
          addTimeline(tx, orderId, { type: "refund.reconcile_ambiguous", label: "Refund reconciliation is ambiguous - manual provider check required", detail: m.reason, customerVisible: false, actor });
        });
      }
    }
  } catch (e) {
    const msg = short(e);
    if (e instanceof ProviderError && e.kind === "rejected" && e.httpStatus === 404 && r.providerRefundId) {
      report = { outcome: "mismatch", detail: "The provider has no refund with the recorded id. Manual review required." };
    } else {
      report = { outcome: "provider_unavailable", detail: `The provider could not be reached or answered unexpectedly (${msg}). Nothing was changed.` };
    }
  }
  await record(report.outcome, report.detail);
  await db().runTransaction(async (tx) => {
    auditInTx(tx, actor, "refund.reconcile", orderId, { refundId, outcome: report.outcome });
  });
  return report;
}

/**
 * Manual attestation that the provider holds NO refund for the last attempt. Allowed only after a system search found nothing
 * (recorded on the dispatch) and with a written description of the provider dashboard check. It makes the refund retry-safe with a
 * NEW receipt; if a refund for the old attempt later surfaces it is flagged as a superseded-attempt extra refund, never merged.
 */
export async function attestRefundNotCreated(orderId: string, refundId: string, actor: string, note: string): Promise<Order> {
  const text = note.trim();
  if (text.length < 20) throw badRequest("Describe the provider check you performed (where you looked, what you saw) - at least 20 characters.");
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(orderRef(orderId));
    if (!snap.exists) throw notFound("Order not found.");
    const o = orderFromDoc(snap);
    const r = o.payment.refunds.find((x) => x.id === refundId);
    if (!r) throw notFound("Refund not found.");
    if (r.state !== "processing" || !r.uncertain || r.providerRefundId || !r.attempt) throw conflict("NOT_ATTESTABLE", "Only a refund with an unknown outcome and no provider refund id can be marked as not created.");
    const dRef = dispatchCol(orderId).doc(dispatchId(r.id, r.attempt));
    const dSnap = await tx.get(dRef);
    const d = dSnap.data() as RefundDispatch | undefined;
    if (!d || d.lastCheck?.result !== "not_found" || d.lastCheck.at < d.startedAt) throw conflict("RECONCILE_FIRST", "Run Reconcile with provider first. A manual check is only accepted after the system search found nothing.");
    const now = nowIso();
    const refunds = o.payment.refunds.map((x) => (x.id === r.id ? { ...x, state: "failed" as const, uncertain: false, retrySafe: true, updatedAt: now } : x));
    tx.update(orderRef(orderId), { ...refundPatch(o, refunds), updatedAt: now, version: o.version + 1 });
    tx.update(dRef, { outcome: "attested_absent", attestation: { by: actor, at: now, note: text.slice(0, 500) }, updatedAt: now });
    addTimeline(tx, orderId, { type: "refund.attested_absent", label: "Refund recorded as not created after a manual provider check", detail: text.slice(0, 200), customerVisible: false, actor });
    auditInTx(tx, actor, "refund.attest_absent", orderId, { refundId, attempt: r.attempt, receipt: r.receipt });
  });
  return orderFromDoc(await orderRef(orderId).get());
}

/**
 * Scheduled recovery: re-check every refund still `processing`. Applies only verified provider outcomes. Dispatches younger than
 * `minAgeMs` are skipped so an in-flight request is never raced.
 */
export async function reconcileRefunds(limit = 25, minAgeMs = 120_000): Promise<{ checked: number; resolved: number; stillOpen: number }> {
  const q = await col(C.orders).where("payment.refundsPending", "==", true).limit(limit).get();
  let checked = 0;
  let resolved = 0;
  let stillOpen = 0;
  for (const d of q.docs) {
    const o = orderFromDoc(d);
    for (const r of o.payment.refunds.filter((x) => x.state === "processing")) {
      if (r.attempt) {
        const ds = await dispatchCol(o.id).doc(dispatchId(r.id, r.attempt)).get();
        const started = (ds.data() as RefundDispatch | undefined)?.startedAt;
        if (started && Date.now() - Date.parse(started) < minAgeMs) continue;
      }
      checked++;
      const rep = await reconcileRefund(o.id, r.id, "system:reconcile");
      if (rep.outcome === "completed" || rep.outcome === "failed_confirmed") resolved++;
      else stillOpen++;
    }
  }
  return { checked, resolved, stillOpen };
}

/* ------------------------------------------------------------------ admin views */

export interface RefundRecoveryView {
  dispatches: RefundDispatch[];
  evidence: RefundEvidence[];
}

export async function getRefundRecovery(orderId: string): Promise<RefundRecoveryView> {
  const [d, e] = await Promise.all([dispatchCol(orderId).orderBy("startedAt", "desc").limit(30).get(), evidenceCol(orderId).orderBy("lastSeenAt", "desc").limit(20).get()]);
  return { dispatches: d.docs.map((x) => x.data() as RefundDispatch), evidence: e.docs.map((x) => x.data() as RefundEvidence) };
}
