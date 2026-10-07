/**
 * The raw Channel3 search call: POST https://api.trychannel3.com/v1/search
 * with an x-api-key header. Shapes follow the Channel3 API reference (SDK
 * 4.0): only the fields we read are typed. Every live call is logged at
 * debug level (PAY_PALS_DEBUG) with a running count, so a demo run's credit
 * use can be read off the log.
 */

export const CHANNEL3_SEARCH_URL = "https://api.trychannel3.com/v1/search";

export type Channel3Condition = "new" | "used";
export type Channel3Availability = "InStock" | "OutOfStock";

export interface Channel3Offer {
  url: string;
  domain: string;
  price: { price: number; currency: string; compare_at_price?: number | null };
  availability: Channel3Availability;
  /** null when the merchant did not say. Channel3 treats unknown as new. */
  condition?: Channel3Condition | null;
}

export interface Channel3Product {
  id: string;
  title: string;
  brands?: Array<{ id: string; name: string }>;
  offers?: Channel3Offer[];
}

export interface Channel3SearchResponse {
  products: Channel3Product[];
  next_page_token?: string | null;
}

export interface Channel3SearchRequest {
  query: string;
  /** 1 to 30. */
  limit: number;
  filters?: {
    /** Defaults to ["new"] on the server (unknown counts as new). Pass both to see used offers too. */
    conditions?: Channel3Condition[];
    /** Defaults to ["InStock"] on the server. */
    availability?: Channel3Availability[];
    price?: { min_price?: number; max_price?: number };
  };
  config: { country: "US"; currency: "USD"; mode?: "default" | "keyword" };
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class Channel3Error extends Error {
  constructor(
    public readonly status: number,
    detail: string,
  ) {
    super(`Channel3 search failed with ${status}${detail ? `: ${detail}` : ""}`);
    this.name = "Channel3Error";
  }
}

let liveCalls = 0;

/** How many live Channel3 calls this process has made. For the credit log and tests. */
export function channel3CallCount(): number {
  return liveCalls;
}

function creditHeaders(headers: Headers): string {
  const found: string[] = [];
  headers.forEach((value, name) => {
    if (/credit|quota|ratelimit|rate-limit/i.test(name)) found.push(`${name}=${value}`);
  });
  return found.length > 0 ? found.join(" ") : "not reported by the API";
}

export async function channel3Search(
  apiKey: string,
  request: Channel3SearchRequest,
  fetchImpl: FetchLike = fetch,
): Promise<Channel3SearchResponse> {
  const response = await fetchImpl(CHANNEL3_SEARCH_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify(request),
  });
  liveCalls += 1;
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Channel3Error(response.status, detail.slice(0, 300));
  }
  const body = (await response.json()) as Partial<Channel3SearchResponse>;
  const products = Array.isArray(body.products) ? body.products : [];
  if (process.env.PAY_PALS_DEBUG) {
    console.debug(
      `[pay-pals agents] Channel3 live call #${liveCalls}: query="${request.query}" products=${products.length} credits: ${creditHeaders(response.headers)}`,
    );
  }
  return { products, next_page_token: body.next_page_token ?? null };
}
