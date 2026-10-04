"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Mail, Phone } from "lucide-react";
import { firebaseAuth } from "@/lib/firebase-client";
import { authErrorMessage, completeSignIn } from "@/lib/auth-client";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { PasswordInput } from "./password-input";
import { OtpPanel, usePhoneOtp } from "./otp";

export function LoginForm({ next, notice }: { next: string | null; notice?: string | null }) {
  return (
    <div className="space-y-6">
      {notice && <Alert tone="info">{notice}</Alert>}
      <Tabs
        label="Sign-in method"
        variant="line"
        tabs={[
          { id: "email", label: "Email", content: <EmailLogin next={next} /> },
          { id: "phone", label: "Phone", content: <PhoneLogin next={next} /> },
        ]}
      />
      <p className="text-center text-sm text-ink-muted">
        Don&apos;t have an account?{" "}
        <Link href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="font-medium text-maroon underline underline-offset-4">
          Create one
        </Link>
      </p>
      <p className="text-center text-xs text-ink-muted">Store owners sign in here too. You will be taken to the right place automatically.</p>
    </div>
  );
}

function EmailLogin({ next }: { next: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fe, setFe] = useState<{ email?: string; password?: string }>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    const errs: typeof fe = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) errs.email = "Enter a valid email address.";
    if (!password) errs.password = "Enter your password.";
    setFe(errs);
    setError(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const cred = await signInWithEmailAndPassword(firebaseAuth(), email, password);
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
      <Field label="Email address" required error={fe.email}>
        {(p) => (
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-3 size-5 text-ink-muted" aria-hidden />
            <Input id={p.id} name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" className="pl-11" aria-invalid={p.invalid} aria-describedby={p.describedBy} />
          </div>
        )}
      </Field>
      <Field label="Password" required error={fe.password}>
        {(p) => <PasswordInput id={p.id} name="password" autoComplete="current-password" placeholder="Your password" aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
      </Field>
      <div className="flex items-center justify-between">
        <Checkbox name="remember" label="Keep me signed in on this device" defaultChecked />
        <Link href="/forgot-password" className="shrink-0 text-sm text-maroon underline underline-offset-4">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={busy}>
        Sign in
      </Button>
    </form>
  );
}

function PhoneLogin({ next }: { next: string | null }) {
  const router = useRouter();
  const otp = usePhoneOtp();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const finish = async () => {
    const user = await otp.confirm(code);
    if (!user) return;
    try {
      const dest = await completeSignIn(user, next);
      router.replace(dest);
      router.refresh();
    } catch (err) {
      otp.setError(err instanceof Error ? err.message : "Could not sign you in.");
    }
  };

  return (
    <div className="space-y-4">
      <div id="recaptcha-login" />
      {otp.stage === "enter" ? (
        <form
          noValidate
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setPhoneError(null);
            const ok = await otp.send(phone, "recaptcha-login");
            if (!ok) setPhoneError(otp.error);
          }}
        >
          {otp.error && <Alert tone="error">{otp.error}</Alert>}
          <Field label="Mobile number" required hint="We will text you a 6-digit code." error={phoneError}>
            {(p) => (
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-3 size-5 text-ink-muted" aria-hidden />
                <Input id={p.id} type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} className="pl-11" aria-describedby={p.describedBy} />
              </div>
            )}
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={otp.busy}>
            Send code
          </Button>
        </form>
      ) : (
        <OtpPanel phoneLabel={phone} code={code} setCode={setCode} otp={otp} onVerify={finish} onResend={() => otp.send(phone, "recaptcha-login")} />
      )}
    </div>
  );
}
