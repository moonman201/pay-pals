/**
 * A scripted fetch for unit tests: records every call, answers from a queue
 * of responses. Used by the token, gateway and handler tests.
 */
import type { FetchLike } from "../http-error";

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  /** Parsed when the request was JSON. */
  body: unknown;
  /** The body exactly as sent. */
  rawBody: string | null;
}

export interface MockFetch {
  fetch: FetchLike;
  calls: RecordedCall[];
  /** Queue a JSON response. Served in order. */
  reply(status: number, body: unknown): MockFetch;
}

export function mockFetch(): MockFetch {
  const queue: Array<{ status: number; body: unknown }> = [];
  const calls: RecordedCall[] = [];
  const mock: MockFetch = {
    calls,
    reply(status, body) {
      queue.push({ status, body });
      return mock;
    },
    fetch: async (url, init) => {
      const headers = Object.fromEntries(Object.entries((init?.headers as Record<string, string>) ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
      const rawBody = typeof init?.body === "string" ? init.body : null;
      let body: unknown = rawBody;
      if (rawBody !== null && headers["content-type"] === "application/json") body = JSON.parse(rawBody);
      calls.push({ url, method: init?.method ?? "GET", headers, body, rawBody });
      const next = queue.shift();
      if (!next) throw new Error(`mockFetch: no response queued for ${init?.method ?? "GET"} ${url}`);
      return new Response(next.body === undefined ? null : JSON.stringify(next.body), {
        status: next.status,
        headers: { "Content-Type": "application/json" },
      });
    },
  };
  return mock;
}

export const TOKEN_OK = { access_token: "test-token", token_type: "Bearer", expires_in: 32400 };
