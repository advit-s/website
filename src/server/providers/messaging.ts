import "server-only";
import { env, ConfigurationError } from "../env";

/**
 * Customer/staff message delivery adapter.
 *
 * Three different facts must never be confused (they are different outbox states):
 *   queued     - we intend to send it
 *   previewed  - rendered and stored for inspection in a LOCAL simulated build. Nothing reached anyone.
 *   delivered  - a real channel accepted the message and returned a provider message id.
 *
 * Which vendor sends real messages is an OWNER DECISION that has not been made (docs/OWNER_SETUP.md section D/E). Until one is
 * chosen no real channel exists in this build: live mode reports "unavailable" instead of pretending. To add a vendor, implement
 * `MessageChannel`, return it from `liveChannel()` for its MESSAGING_PROVIDER value, and run the contract tests in
 * tests/integration/messaging.test.ts against it (with the vendor's sandbox, never real recipients).
 */
export interface RenderedMessage {
  subject: string;
  body: string;
}

export interface MessageRecipient {
  email?: string | null;
  phone?: string | null;
  /** Staff notification: the channel resolves the recipient from private settings. */
  admin?: boolean;
}

export type ChannelName = "email" | "sms" | "whatsapp";

export interface MessageChannel {
  readonly name: ChannelName;
  /** True when credentials/templates needed to send are present. */
  configured(): boolean;
  /**
   * Send one message. `idempotencyKey` is stable per outbox record: vendors that support it must dedupe on it so a crash
   * between a successful send and our bookkeeping cannot message the customer twice.
   * Throw `DeliveryError(retryable)` for failures; return only when the vendor ACCEPTED the message.
   */
  send(to: MessageRecipient, message: RenderedMessage, ctx: { idempotencyKey: string }): Promise<{ providerMessageId: string }>;
}

export class DeliveryError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "DeliveryError";
  }
}

let testChannel: MessageChannel | null | undefined;
/** Test hook: inject a mocked vendor (contract tests). Pass undefined to clear. */
export function setMessageChannelForTests(c: MessageChannel | null | undefined): void {
  testChannel = c;
}

/**
 * The real channel for live mode, or null when none exists/is configured.
 * No vendor is implemented yet, so a MESSAGING_PROVIDER value is rejected explicitly rather than ignored.
 */
export function liveChannel(): MessageChannel | null {
  if (testChannel !== undefined) return testChannel;
  const name = env().MESSAGING_PROVIDER;
  if (!name || name === "none") return null;
  throw new ConfigurationError(`MESSAGING_PROVIDER="${name}" has no adapter in this build. Implement it in src/server/providers/messaging.ts (docs/OWNER_SETUP.md).`);
}

/** What a customer-facing screen may truthfully say about delivery right now. */
export type DeliveryCapability = "preview_only" | "available" | "unavailable";

export function deliveryCapability(): DeliveryCapability {
  if (env().INTEGRATION_MODE === "simulated") return "preview_only";
  try {
    const c = liveChannel();
    return c && c.configured() ? "available" : "unavailable";
  } catch {
    return "unavailable";
  }
}
