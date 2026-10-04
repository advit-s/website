"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { confirmPasswordReset, sendPasswordResetEmail, verifyPasswordResetCode } from "firebase/auth";
import { Mail, CheckCircle2 } from "lucide-react";
import clsx from "clsx";
import { firebaseAuth } from "@/lib/firebase-client";
import { authErrorMessage } from "@/lib/auth-client";
import { passwordSchema } from "@/domain/validation";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { PasswordInput } from "./password-input";

type Step = "email" | "sent" | "verifying" | "newpass" | "done" | "invalid";
const STEPS = [
  { id: "email", label: "Enter email" },
  { id: "sent", label: "Check email" },
  { id: "newpass", label: "New password" },
  { id: "done", label: "Success" },
] as const;

/**
 * One route, four states, driven by the Firebase `oobCode` in the URL (mode=resetPassword&oobCode=...).
 * Firebase owns token generation, expiry and single use; the app never sees or stores the token.
 */
export function ForgotPassword({ oobCode, mode }: { oobCode: string | null; mode: string | null }) {
  const [step, setStep] = useState<Step>(oobCode && mode === "resetPassword" ? "verifying" : "email");
  const [email, setEmail] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (step !== "verifying" || !oobCode) return;
    verifyPasswordResetCode(firebaseAuth(), oobCode)
      .then((e) => {
        setAccountEmail(e);
        setStep("newpass");
      })
      .catch((e) => {
        setError(authErrorMessage(e));
        setStep("invalid");
      });
  }, [step, oobCode]);

  const activeIndex = step === "email" ? 0 : step === "sent" ? 1 : step === "verifying" || step === "newpass" ? 2 : step === "done" ? 3 : 0;

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setFe({ email: "Enter a valid email address." });
    setFe({});
    setError(null);
    setBusy(true);
    try {
      await sendPasswordResetEmail(firebaseAuth(), email.trim(), { url: `${window.location.origin}/login` });
    } catch (err) {
      const code = (err as { code?: string }).code;
      // Never reveal whether an account exists: treat "user-not-found" like success.
      if (code && code !== "auth/user-not-found" && code !== "auth/invalid-email") {
        setError(authErrorMessage(err));
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    setStep("sent");
  }

  async function setPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const pw = String(fd.get("password") ?? "");
    const confirm = String(fd.get("confirm") ?? "");
    const errs: Record<string, string> = {};
    const parsed = passwordSchema.safeParse(pw);
    if (!parsed.success) errs.password = parsed.error.issues[0]!.message;
    if (pw !== confirm) errs.confirm = "Passwords do not match.";
    setFe(errs);
    if (Object.keys(errs).length || !oobCode) return;
    setBusy(true);
    setError(null);
    try {
      await confirmPasswordReset(firebaseAuth(), oobCode, pw);
      setStep("done");
    } catch (err) {
      setError(authErrorMessage(err));
      if (["auth/expired-action-code", "auth/invalid-action-code"].includes((err as { code?: string }).code ?? "")) setStep("invalid");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <ol className="flex items-center justify-between gap-1" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex flex-1 flex-col items-center gap-1.5 text-center" aria-current={i === activeIndex ? "step" : undefined}>
            <span className={clsx("grid size-8 place-items-center rounded-full border text-sm", i <= activeIndex && step !== "invalid" ? "border-maroon bg-maroon text-white" : "border-taupe text-ink-muted")}>{i + 1}</span>
            <span className={clsx("text-[0.7rem] sm:text-xs", i === activeIndex ? "font-medium text-maroon" : "text-ink-muted")}>{s.label}</span>
          </li>
        ))}
      </ol>

      {error && step !== "invalid" && <Alert tone="error">{error}</Alert>}

      {step === "email" && (
        <form onSubmit={sendLink} noValidate className="space-y-4 border border-line bg-white p-5">
          <p className="text-center text-sm text-ink-muted">Enter your email and we will send you a secure link to choose a new password.</p>
          <Field label="Email address" required error={fe.email}>
            {(p) => (
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-3 size-5 text-ink-muted" aria-hidden />
                <Input id={p.id} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-11" aria-invalid={p.invalid} aria-describedby={p.describedBy} />
              </div>
            )}
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            Send reset link
          </Button>
          <p className="text-center text-xs text-ink-muted">Signed up with a phone number? You do not need a password. <Link href="/login" className="text-maroon underline underline-offset-4">Sign in with an OTP</Link>.</p>
        </form>
      )}

      {step === "sent" && (
        <div className="space-y-3 border border-line bg-white p-5 text-center" role="status">
          <h2 className="t-h3">Check your email</h2>
          <p className="text-ink-muted">If an account exists for <strong>{email}</strong>, a reset link is on its way. It expires after a short time and can be used once.</p>
          <p className="text-sm text-ink-muted">Nothing arrived? Check spam, or <button type="button" className="text-maroon underline underline-offset-4" onClick={() => setStep("email")}>try again</button>.</p>
        </div>
      )}

      {step === "verifying" && <p role="status" className="text-center text-ink-muted">Checking your reset link&hellip;</p>}

      {step === "newpass" && (
        <form onSubmit={setPassword} noValidate className="space-y-4 border border-line bg-white p-5">
          <p className="text-center text-sm text-ink-muted">Choose a new password for <strong>{accountEmail}</strong>.</p>
          <Field label="New password" required error={fe.password} hint="At least 8 characters with an uppercase letter, a lowercase letter and a number.">
            {(p) => <PasswordInput id={p.id} name="password" autoComplete="new-password" aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
          </Field>
          <Field label="Confirm new password" required error={fe.confirm}>
            {(p) => <PasswordInput id={p.id} name="confirm" autoComplete="new-password" aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            Update password
          </Button>
        </form>
      )}

      {step === "done" && (
        <div className="space-y-4 border border-line bg-white p-6 text-center" role="status">
          <CheckCircle2 className="mx-auto size-10 text-success" aria-hidden />
          <h2 className="t-h3">Password updated</h2>
          <p className="text-ink-muted">You can now sign in with your new password.</p>
          <ButtonLink href="/login">Go to sign in</ButtonLink>
        </div>
      )}

      {step === "invalid" && (
        <div className="space-y-4" role="alert">
          <Alert tone="error" title="This link can&apos;t be used">
            {error ?? "It may have expired or already been used."} Reset links work once and expire quickly.
          </Alert>
          <Button className="w-full" onClick={() => (window.location.href = "/forgot-password")}>
            Request a new link
          </Button>
        </div>
      )}
    </div>
  );
}
