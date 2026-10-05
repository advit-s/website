import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("APP_ENV", "local");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://shop.example.test");
});
afterEach(() => vi.unstubAllEnvs());

describe("mutation origin validation", () => {
  it("accepts the configured origin behind a proxy", async () => {
    const { assertSameOrigin } = await import("@/server/http");
    expect(() => assertSameOrigin(new Request("https://internal.test/api/cart", {
      headers: { origin: "https://shop.example.test", host: "internal.test" },
    }))).not.toThrow();
  });

  it("does not let request headers add a trusted origin", async () => {
    const { assertSameOrigin } = await import("@/server/http");
    expect(() => assertSameOrigin(new Request("https://shop.example.test/api/cart", {
      headers: { origin: "https://attacker.test", host: "attacker.test", "x-forwarded-host": "attacker.test" },
    }))).toThrow("Cross-origin request blocked");
  });

  it("rejects a different scheme even when the host matches", async () => {
    const { assertSameOrigin } = await import("@/server/http");
    expect(() => assertSameOrigin(new Request("https://shop.example.test/api/cart", {
      headers: { origin: "http://shop.example.test" },
    }))).toThrow("Cross-origin request blocked");
  });
});

describe("production environment", () => {
  it("rejects the Storage emulator in production", async () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("INTEGRATION_MODE", "live");
    vi.stubEnv("FIREBASE_STORAGE_EMULATOR_HOST", "127.0.0.1:9199");
    const { env } = await import("@/server/env");
    expect(() => env()).toThrow(/emulator hosts/);
  });
});
