"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createUserWithEmailAndPassword, sendEmailVerification, updateProfile } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase-client";
import { authErrorMessage, completeSignIn } from "@/lib/auth-client";
import { passwordSchema, normalizeIndianPhone } from "@/domain/validation";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { PasswordInput } from "./password-input";
import { OtpPanel, usePhoneOtp } from "./otp";

export function RegisterForm({ next }: { next: string | null }) {
  return (
    <div className="space-y-6">
      <Tabs
        label="Sign-up method"
        variant="line"
        tabs={[
          { id: "phone", label: "Phone (OTP)", content: <PhoneRegister next={next} /> },
          { id: "email", label: "Email", content: <EmailRegister next={next} /> },
        ]}
      />
      <p className="text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-medium text-maroon underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}

const TermsLabel = (
  <span>
    I agree to the{" "}
    <Link href="/terms" target="_blank" className="text-maroon underline underline-offset-4">
      Terms
    </Link>{" "}
    and{" "}
    <Link href="/privacy" target="_blank" className="text-maroon underline underline-offset-4">
      Privacy Policy
    </Link>
  </span>
);

function EmailRegister({ next }: { next: string | null }) {
  const router = useRouter();
  const [fe, setFe] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    const confirm = String(fd.get("confirm") ?? "");
    const errs: Record<string, string> = {};
    if (name.length < 2) errs.name = "Enter your full name.";
    if (!/^\S+@\S+\.\S+$/.test(email)) errs.email = "Enter a valid email address.";
    const pw = passwordSchema.safeParse(password);
    if (!pw.success) errs.password = pw.error.issues[0]!.message;
    if (password !== confirm) errs.confirm = "Passwords do not match.";
    if (fd.get("terms") !== "on") errs.terms = "Please accept the Terms to continue.";
    setFe(errs);
    setError(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const auth = firebaseAuth();
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      // Verification email is best-effort: the account works immediately, trust-sensitive features may require it later.
      await sendEmailVerification(cred.user).catch(() => undefined);
      const dest = await completeSignIn(cred.user, next);
      router.replace(dest);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && !(err as { code?: string }).code ? err.message : authErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Full name" required error={fe.name}>
        {(p) => <Input id={p.id} name="name" autoComplete="name" aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
      </Field>
      <Field label="Email address" required error={fe.email}>
        {(p) => <Input id={p.id} name="email" type="email" autoComplete="email" inputMode="email" aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
      </Field>
      <Field label="Password" required error={fe.password} hint="At least 8 characters with an uppercase letter, a lowercase letter and a number.">
        {(p) => <PasswordInput id={p.id} name="password" autoComplete="new-password" aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
      </Field>
      <Field label="Confirm password" required error={fe.confirm}>
        {(p) => <PasswordInput id={p.id} name="confirm" autoComplete="new-password" aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
      </Field>
      <div>
        <Checkbox name="terms" label={TermsLabel} />
        {fe.terms && (
          <p role="alert" className="mt-1 text-xs font-medium text-error">
            {fe.terms}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" className="w-full" loading={busy}>
        Create account
      </Button>
    </form>
  );
}

function PhoneRegister({ next }: { next: string | null }) {
  const router = useRouter();
  const otp = usePhoneOtp();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [terms, setTerms] = useState(false);
  const [code, setCode] = useState("");
  const [fe, setFe] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (name.trim().length < 2) errs.name = "Enter your full name.";
    if (!normalizeIndianPhone(phone)) errs.phone = "Enter a valid 10-digit Indian mobile number.";
    if (!terms) errs.terms = "Please accept the Terms to continue.";
    setFe(errs);
    return Object.keys(errs).length === 0;
  };

  const finish = async () => {
    const user = await otp.confirm(code);
    if (!user) return;
    try {
      if (!user.displayName) await updateProfile(user, { displayName: name.trim() });
      const dest = await completeSignIn(user, next);
      router.replace(dest);
      router.refresh();
    } catch (err) {
      otp.setError(err instanceof Error ? err.message : "Could not create your account.");
    }
  };

  return (
    <div className="space-y-4">
      <div id="recaptcha-register" />
      {otp.stage === "enter" ? (
        <form
          noValidate
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (validate()) await otp.send(phone, "recaptcha-register");
          }}
        >
          <p className="text-sm text-ink-muted">Phone is the quickest way to join. If you already have an account, we will sign you in.</p>
          {otp.error && <Alert tone="error">{otp.error}</Alert>}
          <Field label="Full name" required error={fe.name}>
            {(p) => <Input id={p.id} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
          </Field>
          <Field label="Mobile number" required error={fe.phone} hint="We will text you a 6-digit code.">
            {(p) => <Input id={p.id} type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
          </Field>
          <div>
            <Checkbox checked={terms} onChange={(e) => setTerms(e.target.checked)} label={TermsLabel} />
            {fe.terms && (
              <p role="alert" className="mt-1 text-xs font-medium text-error">
                {fe.terms}
              </p>
            )}
          </div>
          <Button type="submit" size="lg" className="w-full" loading={otp.busy}>
            Send code
          </Button>
        </form>
      ) : (
        <OtpPanel phoneLabel={phone} code={code} setCode={setCode} otp={otp} onVerify={finish} onResend={() => otp.send(phone, "recaptcha-register")} />
      )}
    </div>
  );
}
