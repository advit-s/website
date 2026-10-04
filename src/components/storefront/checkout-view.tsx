"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banknote, CreditCard, Lock, ShieldCheck, Truck } from "lucide-react";
import clsx from "clsx";
import { useCart } from "@/components/providers/cart";
import { prefs, newKey } from "@/lib/checkout-prefs";
import { usePricedCart } from "./use-priced-cart";
import { Media } from "@/components/ui/media";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState, SimulationBadge, Skeleton } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Dialog } from "@/components/ui/dialog";
import { INDIAN_STATES, normalizeIndianPhone } from "@/domain/validation";
import { formatINR } from "@/domain/money";
import type { SavedAddress } from "@/domain/types";
import type { PaymentSession } from "@/server/services/checkout";

export interface CheckoutInitial {
  user: { name: string; email: string; phone: string } | null;
  addresses: SavedAddress[];
  codEnabled: boolean;
  simulated: boolean;
  holdMinutes: number;
}

type Errors = Record<string, string>;
type Phase = "form" | "placing" | "paying" | "failed";

interface PlacedOrder {
  id: string;
  number: string;
  total: number;
  canSwitchToCod: boolean;
  attemptsLeft: number;
}

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: unknown) => void) => void };
  }
}

function loadRazorpay(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), credentials: "same-origin" });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

export function CheckoutView({ initial }: { initial: CheckoutInitial }) {
  const router = useRouter();
  const cart = useCart();
  const defaultAddr = initial.addresses.find((a) => a.isDefault) ?? initial.addresses[0];

  const [contact, setContact] = useState({ name: initial.user?.name ?? "", email: initial.user?.email ?? "", phone: initial.user?.phone ?? "" });
  const [addr, setAddr] = useState({
    fullName: defaultAddr?.fullName ?? "",
    phone: defaultAddr?.phone ?? "",
    line1: defaultAddr?.line1 ?? "",
    line2: defaultAddr?.line2 ?? "",
    city: defaultAddr?.city ?? "",
    state: defaultAddr?.state ?? "",
    pincode: defaultAddr?.pincode ?? "",
  });
  const [savedId, setSavedId] = useState<string>(defaultAddr?.id ?? "");
  const [saveAddr, setSaveAddr] = useState(!defaultAddr && Boolean(initial.user));
  const [method, setMethod] = useState<"razorpay" | "cod">("razorpay");
  const [terms, setTerms] = useState(false);
  const [coupon, setCoupon] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("form");
  const [order, setOrder] = useState<PlacedOrder | null>(null);
  const [failMsg, setFailMsg] = useState<string | null>(null);
  const [simSession, setSimSession] = useState<PaymentSession | null>(null);
  const [resumed, setResumed] = useState<string | null>(null);
  const attempt = useRef<{ hash: string; key: string } | null>(null);
  const honeypot = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const c = prefs.coupon();
    setCoupon(c);
    setCouponInput(c);
    if (!defaultAddr) {
      const p = prefs.pincode();
      if (p) setAddr((a) => ({ ...a, pincode: a.pincode || p }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { priced, error: priceError, loading, ready, lines, refresh } = usePricedCart({ pincode: addr.pincode, couponCode: coupon, paymentMethod: method });
  const codOk = initial.codEnabled && (priced?.codAllowed ?? true);

  useEffect(() => {
    if (method === "cod" && priced && !priced.codAllowed) setMethod("razorpay");
  }, [priced, method]);

  /* ---------- resume an unpaid order after refresh ---------- */
  useEffect(() => {
    const id = prefs.pendingOrder();
    if (!id || order) return;
    (async () => {
      const r = await fetch(`/api/checkout/status?orderId=${encodeURIComponent(id)}`);
      if (!r.ok) return prefs.setPendingOrder(null);
      const s = await r.json();
      if (s.paymentStatus === "paid") {
        prefs.setPendingOrder(null);
        router.replace(`/checkout/success?o=${id}`);
      } else if (s.paymentMethod === "razorpay" && s.holdExpiresAt) {
        setOrder({ id, number: s.orderNumber, total: s.total, canSwitchToCod: s.canSwitchToCod, attemptsLeft: Math.max(0, s.maxAttempts - s.attempts) });
        setResumed(s.orderNumber);
        setPhase("failed");
        setFailMsg("You have an order waiting for payment. Complete it below, or change how you pay.");
      } else prefs.setPendingOrder(null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof typeof addr>(k: K, v: string) => setAddr((a) => ({ ...a, [k]: v }));

  const applySavedAddress = (id: string) => {
    setSavedId(id);
    const a = initial.addresses.find((x) => x.id === id);
    if (a) setAddr({ fullName: a.fullName, phone: a.phone, line1: a.line1, line2: a.line2, city: a.city, state: a.state, pincode: a.pincode });
    else setAddr({ fullName: contact.name, phone: contact.phone, line1: "", line2: "", city: "", state: "", pincode: "" });
  };

  const validate = (): Errors => {
    const e: Errors = {};
    if (contact.name.trim().length < 2) e["contact.name"] = "Enter your full name.";
    if (!/^\S+@\S+\.\S+$/.test(contact.email.trim())) e["contact.email"] = "Enter a valid email address.";
    if (!normalizeIndianPhone(contact.phone)) e["contact.phone"] = "Enter a valid 10-digit Indian mobile number.";
    if (addr.fullName.trim().length < 2) e["address.fullName"] = "Enter the recipient's name.";
    if (!normalizeIndianPhone(addr.phone || contact.phone)) e["address.phone"] = "Enter a valid delivery phone number.";
    if (addr.line1.trim().length < 5) e["address.line1"] = "Enter house number and street.";
    if (addr.city.trim().length < 2) e["address.city"] = "Enter the city.";
    if (!addr.state) e["address.state"] = "Select a state.";
    if (!/^[1-9]\d{5}$/.test(addr.pincode)) e["address.pincode"] = "Enter a valid 6-digit pincode.";
    else if (priced?.pincode && !priced.pincode.ok) e["address.pincode"] = priced.pincode.message;
    if (!terms) e.terms = "Please accept the Terms and Privacy Policy to place your order.";
    return e;
  };

  const finish = useCallback(
    async (orderId: string) => {
      prefs.setPendingOrder(null);
      await cart.clear();
      router.push(`/checkout/success?o=${encodeURIComponent(orderId)}`);
    },
    [cart, router],
  );

  /* ---------- payment ---------- */
  const afterCallback = useCallback(
    async (o: PlacedOrder, cb: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
      setPhase("paying");
      const r = await postJson("/api/checkout/verify", { orderId: o.id, ...cb });
      if (!r.ok) {
        setPhase("failed");
        setFailMsg(r.data?.error?.message ?? "We could not confirm your payment. If money was deducted, it will be reconciled automatically - check your orders shortly.");
        return;
      }
      if (r.data.status === "paid" || r.data.status === "pending") return finish(o.id); // "pending" is shown honestly on the confirmation page
      setPhase("failed");
      setFailMsg("We couldn't process your payment. Please try again or choose another payment method.");
    },
    [finish],
  );

  const openPayment = useCallback(
    async (o: PlacedOrder, session: PaymentSession) => {
      setPhase("paying");
      if (session.simulated) {
        setSimSession(session);
        return;
      }
      const ok = await loadRazorpay();
      if (!ok || !window.Razorpay || !session.keyId) {
        setPhase("failed");
        setFailMsg("The payment window could not be loaded. Check your connection and try again.");
        return;
      }
      const rzp = new window.Razorpay({
        key: session.keyId,
        amount: session.amount,
        currency: session.currency,
        order_id: session.providerOrderId,
        name: "Raj Raani Collections",
        description: `Order ${o.number}`,
        prefill: { name: contact.name, email: contact.email, contact: contact.phone },
        theme: { color: "#4A1020" },
        handler: (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void afterCallback(o, resp),
        modal: {
          ondismiss: () => {
            setPhase("failed");
            setFailMsg("Payment was not completed. Your items are held for a short time - you can try again.");
          },
        },
      });
      rzp.on("payment.failed", () => {
        setPhase("failed");
        setFailMsg("We couldn't process your payment. Please try again or choose another payment method.");
      });
      rzp.open();
    },
    [afterCallback, contact.email, contact.name, contact.phone],
  );

  const simulate = async (outcome: "success" | "failed" | "cancelled") => {
    if (!order) return;
    setSimSession(null);
    const r = await postJson("/api/dev/simulate-payment", { orderId: order.id, outcome });
    if (!r.ok) {
      setPhase("failed");
      setFailMsg(r.data?.error?.message ?? "Simulation failed.");
      return;
    }
    if (r.data.cancelled) {
      setPhase("failed");
      setFailMsg("Payment was not completed. Your items are held for a short time - you can try again.");
      return;
    }
    if (outcome === "failed") {
      setPhase("failed");
      setFailMsg("We couldn't process your payment. Please try again or choose another payment method.");
      return;
    }
    await afterCallback(order, r.data);
  };

  const refreshOrderStatus = async (id: string): Promise<Partial<PlacedOrder>> => {
    const r = await fetch(`/api/checkout/status?orderId=${encodeURIComponent(id)}`);
    if (!r.ok) return {};
    const s = await r.json();
    return { canSwitchToCod: s.canSwitchToCod, attemptsLeft: Math.max(0, s.maxAttempts - s.attempts) };
  };

  const retry = async () => {
    if (!order) return;
    setFormError(null);
    setPhase("paying");
    const r = await postJson("/api/checkout/pay", { orderId: order.id, action: "retry" });
    if (!r.ok) {
      setPhase("failed");
      setFailMsg(r.data?.error?.message ?? "Could not start another attempt.");
      if (r.data?.error?.code === "ORDER_EXPIRED") prefs.setPendingOrder(null);
      return;
    }
    const extra = await refreshOrderStatus(order.id);
    const next = { ...order, ...extra };
    setOrder(next);
    await openPayment(next, r.data.payment);
  };

  const changeToCod = async () => {
    if (!order) return;
    setPhase("paying");
    const r = await postJson("/api/checkout/pay", { orderId: order.id, action: "switch_cod" });
    if (!r.ok) {
      setPhase("failed");
      setFailMsg(r.data?.error?.message ?? "Cash on delivery is not available for this order.");
      return;
    }
    await finish(order.id);
  };

  /* ---------- submit ---------- */
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (phase === "placing" || phase === "paying") return; // double-click guard
    setFormError(null);
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById(Object.keys(errs)[0]!.replace(/\./g, "-"))?.focus();
      return;
    }
    setPhase("placing");
    const payload = {
      lines,
      contact: { name: contact.name.trim(), email: contact.email.trim(), phone: contact.phone },
      address: { ...addr, phone: addr.phone || contact.phone, fullName: addr.fullName.trim(), landmark: undefined },
      paymentMethod: method,
      couponCode: coupon || undefined,
      website: honeypot.current?.value ?? "",
    };
    // Same payload => same idempotency key, so a double submit or a retry after a dropped response cannot create a second order.
    const hash = JSON.stringify({ ...payload, website: undefined });
    if (!attempt.current || attempt.current.hash !== hash) attempt.current = { hash, key: newKey() };
    const r = await postJson("/api/checkout", payload, { "Idempotency-Key": attempt.current.key });
    if (!r.ok) {
      setPhase("form");
      const err = r.data?.error;
      if (r.status === 422 && err?.fields) setErrors(err.fields as Errors);
      else if (err?.code === "CART_CHANGED" || err?.code === "OUT_OF_STOCK" || err?.code === "PRICE_CHANGED") {
        setFormError(err.message + " We have refreshed your totals below.");
        void refresh();
      } else setFormError(err?.message ?? "We could not place your order. Please try again.");
      return;
    }
    const o: PlacedOrder = { id: r.data.orderId, number: r.data.orderNumber, total: r.data.total, canSwitchToCod: false, attemptsLeft: 2 };
    if (saveAddr && initial.user) {
      void postJson("/api/account/addresses", { label: "Home", ...addr, phone: addr.phone || contact.phone, country: "IN", isDefault: initial.addresses.length === 0 });
    }
    if (r.data.paymentMethod === "cod") return finish(o.id);
    prefs.setPendingOrder(o.id);
    const extra = await refreshOrderStatus(o.id);
    const full = { ...o, ...extra };
    setOrder(full);
    await openPayment(full, r.data.payment as PaymentSession);
  }

  const applyCoupon = () => {
    const c = couponInput.trim().toUpperCase();
    setCoupon(c);
    prefs.setCoupon(c);
  };

  /* ---------- render ---------- */
  const locked = phase !== "form";
  const p = priced;
  const err = (k: string) => errors[k] ?? null;
  const count = p ? p.items.reduce((n, i) => n + i.quantity, 0) : 0;
  const placeLabel = useMemo(() => (method === "cod" ? "Place order (cash on delivery)" : "Pay securely"), [method]);

  if (!ready) return <Skeleton className="h-96 w-full" />;
  if (lines.length === 0 && !order) {
    return (
      <EmptyState title="Your bag is empty" action={<Link href="/shop" className="text-maroon underline underline-offset-4">Continue shopping</Link>}>
        Add something to your bag before checking out.
      </EmptyState>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Checkout" className="grid gap-10 lg:grid-cols-[1fr_26rem]">
      <div className="min-w-0 space-y-10">
        {phase === "failed" && order && (
          <section aria-labelledby="pay-fail" className="border border-error/40 bg-error-bg p-6 text-center" role="alert">
            <h2 id="pay-fail" className="t-h3 !text-error">
              {resumed ? `Order ${order.number} is waiting for payment` : "Payment unsuccessful"}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-charcoal">{failMsg}</p>
            <p className="mt-1 text-xs text-ink-muted">Order {order.number} &middot; {formatINR(order.total)}. Items are held for about {initial.holdMinutes} minutes.</p>
            <div className="mx-auto mt-5 flex max-w-sm flex-col gap-3">
              <Button type="button" onClick={retry} disabled={order.attemptsLeft <= 0}>
                {order.attemptsLeft <= 0 ? "No more attempts for this order" : "Try again"}
              </Button>
              <Button type="button" variant="secondary" onClick={changeToCod} disabled={!order.canSwitchToCod}>
                Pay by cash on delivery instead
              </Button>
              {!order.canSwitchToCod && <p className="text-xs text-ink-muted">Cash on delivery isn&apos;t available for this order. You can try another online method.</p>}
            </div>
          </section>
        )}

        {formError && <Alert tone="error" title="We couldn't place your order">{formError}</Alert>}
        {priceError && <Alert tone="error">{priceError}</Alert>}
        {p && !p.allOk && (
          <Alert tone="warning" title="Your bag has changed">
            Some items are no longer available in the quantity you chose. <Link href="/cart" className="underline underline-offset-4">Review your bag</Link> before placing the order.
          </Alert>
        )}

        <fieldset disabled={locked} className="space-y-10 disabled:opacity-60">
          {/* honeypot */}
          <div aria-hidden className="absolute -left-[9999px]">
            <label>
              Website
              <input ref={honeypot} name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>

          <section aria-labelledby="s1">
            <StepHeading n={1} id="s1" title="Contact information" aside={!initial.user ? <>Already have an account? <Link href="/login?next=/checkout" className="text-maroon underline underline-offset-4">Sign in</Link></> : undefined} />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field id="contact-name" label="Full name" required error={err("contact.name")}>{(f) => <Input id="contact-name" name="name" autoComplete="name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} aria-invalid={f.invalid} aria-describedby={f.describedBy} />}</Field>
              <Field id="contact-phone" label="Mobile number" required error={err("contact.phone")} hint="For delivery updates">{(f) => <Input id="contact-phone" name="tel" type="tel" inputMode="tel" autoComplete="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} aria-invalid={f.invalid} aria-describedby={f.describedBy} />}</Field>
              <Field id="contact-email" label="Email address" required error={err("contact.email")} className="sm:col-span-2" hint="Your receipt is sent here">{(f) => <Input id="contact-email" name="email" type="email" inputMode="email" autoComplete="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} aria-invalid={f.invalid} aria-describedby={f.describedBy} />}</Field>
            </div>
            <p className="mt-3 text-xs text-ink-muted">Guest checkout is fine - no account needed. We use these details only to process and deliver this order.</p>
          </section>

          <section aria-labelledby="s2">
            <StepHeading n={2} id="s2" title="Delivery address" />
            <p className="mt-1 text-sm text-ink-muted">We deliver within India only.</p>
            {initial.addresses.length > 0 && (
              <div className="mt-4">
                <Field label="Use a saved address">
                  {(f) => (
                    <Select id={f.id} value={savedId} onChange={(e) => applySavedAddress(e.target.value)}>
                      {initial.addresses.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label} - {a.line1}, {a.city} {a.pincode}
                        </option>
                      ))}
                      <option value="">Enter a new address</option>
                    </Select>
                  )}
                </Field>
              </div>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field id="address-fullName" label="Recipient name" required error={err("address.fullName")}>{(f) => <Input id="address-fullName" autoComplete="shipping name" value={addr.fullName} onChange={(e) => set("fullName", e.target.value)} aria-invalid={f.invalid} aria-describedby={f.describedBy} />}</Field>
              <Field id="address-phone" label="Delivery phone" error={err("address.phone")} hint="Leave blank to use your contact number">{(f) => <Input id="address-phone" type="tel" inputMode="tel" autoComplete="shipping tel" value={addr.phone} onChange={(e) => set("phone", e.target.value)} aria-invalid={f.invalid} aria-describedby={f.describedBy} />}</Field>
              <Field id="address-line1" label="Address line 1" required error={err("address.line1")} className="sm:col-span-2">{(f) => <Input id="address-line1" autoComplete="shipping address-line1" placeholder="House no., building, street" value={addr.line1} onChange={(e) => set("line1", e.target.value)} aria-invalid={f.invalid} aria-describedby={f.describedBy} />}</Field>
              <Field label="Address line 2 (optional)" className="sm:col-span-2">{(f) => <Input id={f.id} autoComplete="shipping address-line2" placeholder="Apartment, landmark" value={addr.line2} onChange={(e) => set("line2", e.target.value)} />}</Field>
              <Field id="address-city" label="City" required error={err("address.city")}>{(f) => <Input id="address-city" autoComplete="shipping address-level2" value={addr.city} onChange={(e) => set("city", e.target.value)} aria-invalid={f.invalid} aria-describedby={f.describedBy} />}</Field>
              <Field id="address-state" label="State" required error={err("address.state")}>
                {(f) => (
                  <Select id="address-state" autoComplete="shipping address-level1" value={addr.state} onChange={(e) => set("state", e.target.value)} aria-invalid={f.invalid} aria-describedby={f.describedBy}>
                    <option value="">Select state</option>
                    {INDIAN_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field id="address-pincode" label="Pincode" required error={err("address.pincode")}>{(f) => <Input id="address-pincode" inputMode="numeric" autoComplete="shipping postal-code" maxLength={6} value={addr.pincode} onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); set("pincode", v); prefs.setPincode(v); }} aria-invalid={f.invalid} aria-describedby={f.describedBy} />}</Field>
            </div>
            {initial.user && <div className="mt-3"><Checkbox checked={saveAddr} onChange={(e) => setSaveAddr(e.target.checked)} label="Save this address for future orders" /></div>}
          </section>

          <section aria-labelledby="s3">
            <StepHeading n={3} id="s3" title="Delivery method" />
            <div className="mt-4 flex items-start gap-3 border border-maroon bg-white p-4">
              <Truck className="mt-0.5 size-5 shrink-0 text-wine" aria-hidden />
              <div className="flex-1">
                <p className="font-medium">{p?.zone === "ncr" ? "Delhi NCR delivery" : p?.zone === "rest" ? "Standard delivery across India" : "Standard delivery"}</p>
                <p className="text-sm text-ink-muted">{p?.pincode?.ok ? p.pincode.estimateText : "Enter your pincode to see the delivery estimate. The method is chosen automatically from your pincode."}</p>
                {p?.hasCustom && <p className="mt-1 text-sm text-ink-muted">Made-to-order pieces ship after production, which adds to the time above.</p>}
              </div>
              <p className="font-medium">{p ? (p.pricing.shipping === 0 ? "Free" : p.pricing.shippingEstimated ? `~${formatINR(p.pricing.shipping)}` : formatINR(p.pricing.shipping)) : ""}</p>
            </div>
          </section>

          <section aria-labelledby="s4">
            <StepHeading n={4} id="s4" title="Payment method" aside={<span className="inline-flex items-center gap-1"><Lock className="size-3.5" aria-hidden /> Secure</span>} />
            {initial.simulated && <div className="mt-3"><SimulationBadge what="payments" /></div>}
            <div role="radiogroup" aria-label="Payment method" className="mt-4 grid gap-3 sm:grid-cols-2">
              <PayOption checked={method === "razorpay"} onSelect={() => setMethod("razorpay")} icon={<CreditCard className="size-5" aria-hidden />} title="Pay online" detail="UPI, cards or netbanking on Razorpay's secure window" />
              <PayOption checked={method === "cod"} onSelect={() => codOk && setMethod("cod")} disabled={!codOk} icon={<Banknote className="size-5" aria-hidden />} title="Cash on delivery" detail={codOk ? (p && p.pricing.codFee > 0 ? `Pay on delivery (+${formatINR(p.pricing.codFee)} handling)` : "Pay the courier when it arrives") : (p?.codReason ?? "Not available for this order")} />
            </div>
            <p className="mt-3 text-xs text-ink-muted">We never see or store your card, UPI PIN or bank details. Online payments are confirmed only after Razorpay verifies them.</p>
          </section>

          <section aria-labelledby="s5">
            <StepHeading n={5} id="s5" title="Review & place order" />
            <div className="mt-4">
              <Checkbox id="terms" checked={terms} onChange={(e) => setTerms(e.target.checked)} label={<span>I agree to the <Link href="/terms" target="_blank" className="text-maroon underline underline-offset-4">Terms &amp; Conditions</Link> and <Link href="/privacy" target="_blank" className="text-maroon underline underline-offset-4">Privacy Policy</Link>, and understand the <Link href="/refund-policy" target="_blank" className="text-maroon underline underline-offset-4">returns policy</Link>.</span>} />
              {errors.terms && <p role="alert" className="mt-1 text-xs font-medium text-error">{errors.terms}</p>}
            </div>
            <Button type="submit" size="lg" className="mt-5 w-full" loading={phase === "placing" || phase === "paying"} disabled={!p || !p.allOk}>
              <Lock className="size-4" aria-hidden /> {placeLabel} {p ? <>&middot; {formatINR(p.pricing.total)}</> : null}
            </Button>
          </section>
        </fieldset>
      </div>

      <aside aria-label="Order summary" className="h-fit border border-line bg-white p-5 lg:sticky lg:top-32">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-xl text-maroon">Order summary</h2>
          <span className="text-sm text-ink-muted">{count} item{count === 1 ? "" : "s"}</span>
        </div>
        <ul className="mt-4 divide-y divide-line">
          {p?.items.map((i) => (
            <li key={i.variantId} className="flex gap-3 py-3">
              <div className="w-16 shrink-0"><Media src={i.image?.src} alt="" ratio="4/5" sizes="64px" /></div>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium leading-snug">{i.name}</p>
                <p className="text-ink-muted">Size {i.size} &middot; {i.color} &middot; Qty {i.quantity}</p>
                {i.status !== "ok" && <p className="text-error">Quantity unavailable</p>}
              </div>
              <p className="text-sm font-medium">{formatINR(i.lineTotal)}</p>
            </li>
          ))}
          {!p && <li className="py-3"><Skeleton className="h-16 w-full" /></li>}
        </ul>
        <div className="mt-3 flex gap-2">
          <label htmlFor="co-coupon" className="sr-only">Coupon code</label>
          <Input
            id="co-coupon"
            value={couponInput}
            onChange={(e) => setCouponInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyCoupon();
              }
            }}
            placeholder="Coupon code"
            maxLength={30}
            className="min-h-10"
            disabled={locked}
          />
          <Button type="button" variant="secondary" size="sm" onClick={applyCoupon} disabled={locked}>Apply</Button>
        </div>
        {p?.couponError && coupon && <p className="mt-1 text-xs text-error" role="alert">{p.couponError}</p>}
        {p && (
          <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatINR(p.pricing.subtotal)}</dd></div>
            {p.pricing.discount > 0 && <div className="flex justify-between text-success"><dt>Discount ({p.pricing.couponCode})</dt><dd>&minus; {formatINR(p.pricing.discount)}</dd></div>}
            <div className="flex justify-between"><dt>Delivery{p.pricing.shippingEstimated ? " (estimated)" : ""}</dt><dd>{p.pricing.shipping === 0 ? "Free" : formatINR(p.pricing.shipping)}</dd></div>
            {p.pricing.codFee > 0 && <div className="flex justify-between"><dt>Cash on delivery fee</dt><dd>{formatINR(p.pricing.codFee)}</dd></div>}
            <div className="flex items-baseline justify-between border-t border-line pt-3">
              <dt className="font-serif text-lg text-maroon">Total</dt>
              <dd className="font-serif text-2xl text-maroon" aria-live="polite">{loading ? "..." : formatINR(p.pricing.total)}</dd>
            </div>
          </dl>
        )}
        <p className="mt-1 text-right text-xs text-ink-muted">Inclusive of applicable taxes</p>
        <p className="mt-4 flex items-start gap-2 rounded-sm bg-beige/50 p-3 text-xs text-ink-muted"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-wine" aria-hidden /> Totals are calculated by our server from current prices and stock, not from your browser.</p>
        <Link href="/cart" className="mt-3 inline-block text-sm text-maroon underline underline-offset-4">Edit bag</Link>
      </aside>

      <Dialog open={Boolean(simSession)} onClose={() => void simulate("cancelled")} title="Simulated payment" size="sm">
        <div className="space-y-4">
          <SimulationBadge what="Razorpay Checkout" />
          <p className="text-sm text-ink-muted">This stands in for Razorpay&apos;s window while no live credentials are configured. No money moves. Choose an outcome to test the flow:</p>
          <div className="grid gap-2">
            <Button type="button" onClick={() => void simulate("success")}>Pay {order ? formatINR(order.total) : ""} successfully</Button>
            <Button type="button" variant="secondary" onClick={() => void simulate("failed")}>Fail the payment</Button>
            <Button type="button" variant="ghost" onClick={() => void simulate("cancelled")}>Close without paying</Button>
          </div>
        </div>
      </Dialog>
    </form>
  );
}

function StepHeading({ n, id, title, aside }: { n: number; id: string; title: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-maroon text-sm text-white" aria-hidden>{n}</span>
      <h2 id={id} className="t-h3 flex-1">{title}</h2>
      {aside && <span className="text-sm text-ink-muted">{aside}</span>}
    </div>
  );
}

function PayOption({ checked, onSelect, icon, title, detail, disabled }: { checked: boolean; onSelect: () => void; icon: React.ReactNode; title: string; detail: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-disabled={disabled}
      onClick={onSelect}
      className={clsx("flex items-start gap-3 border p-4 text-left", checked ? "border-maroon bg-white ring-1 ring-maroon" : "border-line bg-white hover:border-maroon", disabled && "cursor-not-allowed bg-beige/40 text-ink-muted hover:border-line")}
    >
      <span className="mt-0.5 text-wine">{icon}</span>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-ink-muted">{detail}</span>
      </span>
    </button>
  );
}
