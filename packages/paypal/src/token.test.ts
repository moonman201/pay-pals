import { describe, expect, it } from "vitest";
import { loadPayPalConfig, PayPalConfigError, SANDBOX_BASE_URL } from "./config";
import { PayPalApiError } from "./http-error";
import { createTokenProvider } from "./token";
import { TOKEN_OK, mockFetch } from "./test-support/mock-fetch";

const env = { PAYPAL_ENV: "sandbox", PAYPAL_CLIENT_ID: "id-123", PAYPAL_CLIENT_SECRET: "secret-456" };
const config = loadPayPalConfig(env);

describe("config", () => {
  it("refuses anything but sandbox", () => {
    expect(() => loadPayPalConfig({ ...env, PAYPAL_ENV: "live" })).toThrow(PayPalConfigError);
    expect(() => loadPayPalConfig({ ...env, PAYPAL_ENV: "production" })).toThrow(PayPalConfigError);
    expect(loadPayPalConfig(env).baseUrl).toBe(SANDBOX_BASE_URL);
    expect(loadPayPalConfig({ ...env, PAYPAL_ENV: undefined }).env).toBe("sandbox");
  });

  it("requires both credentials", () => {
    expect(() => loadPayPalConfig({ PAYPAL_CLIENT_ID: "x" })).toThrow(PayPalConfigError);
  });
});

describe("token provider", () => {
  it("posts client credentials with basic auth", async () => {
    const f = mockFetch().reply(200, TOKEN_OK);
    const tokens = createTokenProvider(config, { fetch: f.fetch });
    expect(await tokens.getToken()).toBe("test-token");
    const call = f.calls[0]!;
    expect(call.url).toBe(`${SANDBOX_BASE_URL}/v1/oauth2/token`);
    expect(call.method).toBe("POST");
    expect(call.headers.authorization).toBe(`Basic ${Buffer.from("id-123:secret-456").toString("base64")}`);
    expect(call.body).toBe("grant_type=client_credentials");
  });

  it("caches until the margin before expiry, then refreshes", async () => {
    let clock = 1_000_000;
    const f = mockFetch().reply(200, { ...TOKEN_OK, expires_in: 600 }).reply(200, { ...TOKEN_OK, access_token: "second" });
    const tokens = createTokenProvider(config, { fetch: f.fetch, now: () => clock, marginSeconds: 60 });
    expect(await tokens.getToken()).toBe("test-token");
    clock += 500_000; // 500s in: still valid (600s - 60s margin = 540s)
    expect(await tokens.getToken()).toBe("test-token");
    expect(f.calls).toHaveLength(1);
    clock += 50_000; // 550s in: inside the margin, refresh
    expect(await tokens.getToken()).toBe("second");
    expect(f.calls).toHaveLength(2);
  });

  it("shares one fetch between concurrent callers", async () => {
    const f = mockFetch().reply(200, TOKEN_OK);
    const tokens = createTokenProvider(config, { fetch: f.fetch });
    const [a, b, c] = await Promise.all([tokens.getToken(), tokens.getToken(), tokens.getToken()]);
    expect([a, b, c]).toEqual(["test-token", "test-token", "test-token"]);
    expect(f.calls).toHaveLength(1);
  });

  it("refetches after invalidate", async () => {
    const f = mockFetch().reply(200, TOKEN_OK).reply(200, { ...TOKEN_OK, access_token: "fresh" });
    const tokens = createTokenProvider(config, { fetch: f.fetch });
    await tokens.getToken();
    tokens.invalidate();
    expect(await tokens.getToken()).toBe("fresh");
  });

  it("surfaces PayPal's error body", async () => {
    const f = mockFetch().reply(401, { error: "invalid_client", error_description: "Client Authentication failed" });
    const tokens = createTokenProvider(config, { fetch: f.fetch });
    await expect(tokens.getToken()).rejects.toBeInstanceOf(PayPalApiError);
  });
});
