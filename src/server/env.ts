import "server-only";
import { z } from "zod";

/**
 * Validated, server-only configuration. Nothing here is ever sent to the browser.
 *
 * APP_ENV            local | staging | production
 * INTEGRATION_MODE   simulated | live   (simulated is REFUSED when APP_ENV=production)
 */
const schema = z.object({
  APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
  INTEGRATION_MODE: z.enum(["simulated", "live"]).default("simulated"),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  GCLOUD_PROJECT: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().default("demo-rajraani"),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().optional(),
  FIRESTORE_EMULATOR_HOST: z.string().optional(),
  FIREBASE_AUTH_EMULATOR_HOST: z.string().optional(),
  FIREBASE_STORAGE_EMULATOR_HOST: z.string().optional(),
  // Production Admin SDK credentials: prefer Application Default Credentials (App Hosting provides them).
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  // Payments
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  // Shipping
  SHIPROCKET_EMAIL: z.string().optional(),
  SHIPROCKET_PASSWORD: z.string().optional(),
  SHIPROCKET_WEBHOOK_TOKEN: z.string().optional(),
  SHIPROCKET_PICKUP_LOCATION: z.string().optional(),
  // Messaging (vendor not chosen yet - see docs/OWNER_SETUP.md). Unset/"none" = no real channel.
  MESSAGING_PROVIDER: z.string().optional(),
  // AI
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),
  // Internal secrets
  JOB_SECRET: z.string().optional(),
  ORDER_TOKEN_SECRET: z.string().optional(),
  SIMULATION_SECRET: z.string().default("local-simulation-secret-not-for-production"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error("Invalid environment configuration: " + parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  const e = parsed.data;
  if (e.APP_ENV === "production" && e.INTEGRATION_MODE !== "live") {
    throw new Error("Refusing to start: INTEGRATION_MODE must be 'live' when APP_ENV=production (simulations are local/staging only).");
  }
  if (e.APP_ENV === "production" && (e.FIRESTORE_EMULATOR_HOST || e.FIREBASE_AUTH_EMULATOR_HOST || e.FIREBASE_STORAGE_EMULATOR_HOST)) {
    throw new Error("Refusing to start: emulator hosts must not be set when APP_ENV=production.");
  }
  cached = e;
  return e;
}

export const isSimulated = (): boolean => env().INTEGRATION_MODE === "simulated";
export const isProduction = (): boolean => env().APP_ENV === "production";
export const usingEmulators = (): boolean => Boolean(env().FIRESTORE_EMULATOR_HOST);

/** Throws a clear configuration error for a live integration that is missing credentials. Never falls back silently. */
export function requireConfigured<K extends keyof Env>(feature: string, ...keys: K[]): Record<K, string> {
  const e = env();
  const missing = keys.filter((k) => !e[k]);
  if (missing.length) {
    throw new ConfigurationError(`${feature} is not configured. Missing: ${missing.join(", ")}. See docs/OWNER_SETUP.md.`);
  }
  return Object.fromEntries(keys.map((k) => [k, e[k] as string])) as Record<K, string>;
}

export class ConfigurationError extends Error {
  readonly code = "NOT_CONFIGURED";
}
