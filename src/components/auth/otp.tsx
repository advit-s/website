"use client";

import { useEffect, useRef, useState } from "react";
import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult, type User } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase-client";
import { authErrorMessage } from "@/lib/auth-client";
import { normalizeIndianPhone } from "@/domain/validation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";

/** Inline 6-digit entry (no separate OTP route). Paste-friendly, one-time-code autofill. */
export function OtpBoxes({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(6, " ").split("");
  const set = (i: number, d: string) => {
    const next = value.padEnd(6, " ").split("");
    next[i] = d || " ";
    onChange(next.join("").replace(/\s+$/g, "").replace(/ /g, ""));
  };
  return (
    <div role="group" aria-label="6-digit verification code" className="flex justify-center gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d.trim()}
          disabled={disabled}
          inputMode="numeric"
          pattern="\d"
          maxLength={1}
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(-1);
            set(i, v);
            if (v && i < 5) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !d.trim() && i > 0) refs.current[i - 1]?.focus();
          }}
          onPaste={(e) => {
            const t = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
            if (t) {
              e.preventDefault();
              onChange(t);
              refs.current[Math.min(5, t.length)]?.focus();
            }
          }}
          className="size-11 rounded-sm border border-taupe bg-white text-center text-lg focus:border-maroon sm:size-12"
        />
      ))}
    </div>
  );
}

/** Phone-OTP state machine around Firebase PhoneAuthProvider (invisible reCAPTCHA in production). */
export function usePhoneOtp() {
  const [stage, setStage] = useState<"enter" | "code">("enter");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const confirmation = useRef<ConfirmationResult | null>(null);
  const verifier = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(
    () => () => {
      verifier.current?.clear();
      verifier.current = null;
    },
    [],
  );

  async function send(rawPhone: string, containerId: string): Promise<boolean> {
    const phone = normalizeIndianPhone(rawPhone);
    if (!phone) {
      setError("Enter a valid 10-digit Indian mobile number.");
      return false;
    }
    setBusy(true);
    setError(null);
    try {
      const auth = firebaseAuth();
      verifier.current ??= new RecaptchaVerifier(auth, containerId, { size: "invisible" });
      confirmation.current = await signInWithPhoneNumber(auth, phone, verifier.current);
      setStage("code");
      setCooldown(30);
      return true;
    } catch (e) {
      verifier.current?.clear();
      verifier.current = null;
      setError(authErrorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function confirm(code: string): Promise<User | null> {
    if (!confirmation.current) return null;
    setBusy(true);
    setError(null);
    try {
      const cred = await confirmation.current.confirm(code);
      return cred.user;
    } catch (e) {
      setError(authErrorMessage(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { stage, busy, error, cooldown, send, confirm, reset: () => (setStage("enter"), setError(null)), setError };
}

export function OtpPanel({ phoneLabel, code, setCode, otp, onVerify, onResend }: { phoneLabel: string; code: string; setCode: (v: string) => void; otp: ReturnType<typeof usePhoneOtp>; onVerify: () => void; onResend: () => void }) {
  return (
    <div className="space-y-4 border border-line bg-white p-5" role="group" aria-label="Verify with OTP">
      <div className="text-center">
        <h2 className="t-h3">Verify with OTP</h2>
        <p className="mt-1 text-sm text-ink-muted">We sent a 6-digit code by SMS to {phoneLabel}.</p>
      </div>
      <OtpBoxes value={code} onChange={setCode} disabled={otp.busy} />
      {otp.error && <Alert tone="error">{otp.error}</Alert>}
      <Button className="w-full" onClick={onVerify} loading={otp.busy} disabled={code.length !== 6}>
        Verify OTP
      </Button>
      <p className="text-center text-sm text-ink-muted">
        Didn&apos;t receive the code?{" "}
        {otp.cooldown > 0 ? (
          <span aria-live="polite">Resend in 0:{String(otp.cooldown).padStart(2, "0")}</span>
        ) : (
          <button type="button" onClick={onResend} className="text-maroon underline underline-offset-4">
            Resend OTP
          </button>
        )}
      </p>
      <p className="text-center text-xs text-ink-muted">
        <button type="button" onClick={otp.reset} className="underline underline-offset-4">
          Use a different number
        </button>
      </p>
    </div>
  );
}
