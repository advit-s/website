import "server-only";

/**
 * Failure of an external provider call, classified by what it proves about side effects:
 *  - "rejected":  the provider answered with a definitive client error; NOTHING was created.
 *  - "duplicate": the provider says the identifier was already used - the object EXISTS and must be located, not re-created.
 *  - "unknown":   timeout, dropped connection, 5xx or unreadable body - the provider MAY have acted. Never retry blindly.
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: "rejected" | "duplicate" | "unknown",
    readonly httpStatus: number | null = null,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Classify a completed HTTP response that was not ok. A structured 4xx body proves the provider refused the request. */
export function classifyHttpFailure(status: number, parsedBody: unknown): "rejected" | "unknown" {
  return status >= 400 && status < 500 && parsedBody !== null && status !== 408 && status !== 409 ? "rejected" : "unknown";
}
