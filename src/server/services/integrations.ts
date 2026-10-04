import "server-only";
import { env, isSimulated } from "../env";

export interface IntegrationStatus {
  mode: "simulated" | "live";
  appEnv: string;
  usingEmulators: boolean;
  items: { key: string; label: string; state: "configured" | "missing" | "simulated"; detail: string }[];
}

/** Reports ONLY whether each integration is configured - never any key, token or secret value. */
export function integrationStatus(): IntegrationStatus {
  const e = env();
  const sim = isSimulated();
  const has = (...v: (string | undefined)[]) => v.every(Boolean);
  const item = (key: string, label: string, ok: boolean, detail: string, simDetail: string) => ({
    key,
    label,
    state: ok ? ("configured" as const) : sim ? ("simulated" as const) : ("missing" as const),
    detail: ok ? detail : sim ? simDetail : "Credentials are missing - this feature will refuse to run until they are provided.",
  });
  return {
    mode: e.INTEGRATION_MODE,
    appEnv: e.APP_ENV,
    usingEmulators: Boolean(e.FIRESTORE_EMULATOR_HOST),
    items: [
      item("razorpay", "Razorpay payments", has(e.RAZORPAY_KEY_ID, e.RAZORPAY_KEY_SECRET), "Key ID and secret present.", "Local simulation of Razorpay Checkout. No money moves."),
      item("razorpay-webhook", "Razorpay webhook secret", has(e.RAZORPAY_WEBHOOK_SECRET), "Webhook secret present.", "Simulated, locally signed webhooks."),
      item("shiprocket", "Shiprocket shipping", has(e.SHIPROCKET_EMAIL, e.SHIPROCKET_PASSWORD), "API user present.", "Simulated bookings (clearly marked). Manual AWB entry always works."),
      item("shiprocket-webhook", "Shiprocket webhook token", has(e.SHIPROCKET_WEBHOOK_TOKEN), "Token present.", "Simulated tracking events."),
      item("anthropic", "AI assistants (Anthropic)", has(e.ANTHROPIC_API_KEY, e.ANTHROPIC_MODEL), "API key and model present.", "Assistants return a clearly labelled local response."),
      { key: "messaging", label: "Customer notifications (SMS / WhatsApp / email)", state: "simulated" as const, detail: "No messaging vendor is selected yet. Messages are recorded as previews only; nothing is delivered to customers." },
      { key: "firebase", label: "Firebase project", state: e.FIRESTORE_EMULATOR_HOST ? ("simulated" as const) : "configured", detail: e.FIRESTORE_EMULATOR_HOST ? "Using local emulators (demo project)." : `Project ${e.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.` },
    ],
  };
}
