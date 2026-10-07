/**
 * OAuth client-credentials token with caching. One token is reused until it
 * is within the safety margin of expiry; concurrent callers share one fetch.
 */
import type { PayPalConfig } from "./config";
import { PayPalApiError, readJson, type FetchLike } from "./http-error";

export interface TokenProvider {
  getToken(): Promise<string>;
  /** Drop the cached token, for example after a 401. */
  invalidate(): void;
}

export interface TokenProviderOptions {
  fetch?: FetchLike;
  now?: () => number;
  /** Seconds before expiry at which the token is treated as expired. */
  marginSeconds?: number;
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

export function createTokenProvider(config: PayPalConfig, opts: TokenProviderOptions = {}): TokenProvider {
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const now = opts.now ?? Date.now;
  const marginMs = (opts.marginSeconds ?? 60) * 1000;
  let cached: CachedToken | null = null;
  let inflight: Promise<CachedToken> | null = null;

  async function fetchToken(): Promise<CachedToken> {
    const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
    const res = await fetchImpl(`${config.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "grant_type=client_credentials",
    });
    const body = await readJson(res);
    if (!res.ok) throw new PayPalApiError("POST /v1/oauth2/token", res.status, body);
    const token = body as { access_token?: string; expires_in?: number };
    if (!token.access_token || typeof token.expires_in !== "number") {
      throw new PayPalApiError("POST /v1/oauth2/token", res.status, { message: "Token response missing access_token or expires_in" });
    }
    return { value: token.access_token, expiresAt: now() + token.expires_in * 1000 };
  }

  return {
    async getToken() {
      if (cached && cached.expiresAt - marginMs > now()) return cached.value;
      if (!inflight) {
        inflight = fetchToken().finally(() => {
          inflight = null;
        });
      }
      cached = await inflight;
      return cached.value;
    },
    invalidate() {
      cached = null;
    },
  };
}
