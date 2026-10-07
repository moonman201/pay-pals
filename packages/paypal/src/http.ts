/**
 * Authenticated JSON calls to the PayPal sandbox. Adds the bearer token,
 * retries once on 401 with a fresh token, and throws PayPalApiError otherwise.
 */
import type { PayPalConfig } from "./config";
import { PayPalApiError, readJson, type FetchLike } from "./http-error";
import type { TokenProvider } from "./token";

export type Json = Record<string, unknown>;

export interface PayPalHttp {
  request(method: "GET" | "POST", path: string, body?: unknown, headers?: Record<string, string>): Promise<Json>;
  /** Same as request, but sends the given string as the body byte for byte. */
  requestRaw(method: "GET" | "POST", path: string, rawJson: string | undefined, headers?: Record<string, string>): Promise<Json>;
}

export function createPayPalHttp(config: PayPalConfig, tokens: TokenProvider, fetchImpl: FetchLike = globalThis.fetch): PayPalHttp {
  async function once(method: string, path: string, body: string | undefined, headers: Record<string, string>): Promise<Response> {
    const token = await tokens.getToken();
    return fetchImpl(`${config.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...headers,
      },
      body,
    });
  }

  const requestRaw: PayPalHttp["requestRaw"] = async (method, path, rawJson, headers = {}) => {
    let res = await once(method, path, rawJson, headers);
    if (res.status === 401) {
      tokens.invalidate();
      res = await once(method, path, rawJson, headers);
    }
    const json = await readJson(res);
    if (!res.ok) throw new PayPalApiError(`${method} ${path}`, res.status, json);
    return json;
  };

  return {
    requestRaw,
    request: (method, path, body, headers) => requestRaw(method, path, body === undefined ? undefined : JSON.stringify(body), headers),
  };
}
