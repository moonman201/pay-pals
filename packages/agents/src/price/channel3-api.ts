/**
 * The raw Channel3 search call: POST https://api.trychannel3.com/v1/search
 * with an x-api-key header. Only the response fields we read are typed.
 * Reference: https://docs.trychannel3.com/api-reference/v1/search
 */

export const CHANNEL3_SEARCH_URL = "https://api.trychannel3.com/v1/search";

export interface Channel3Offer {
  url: string;
  domain: string;
  price: { price: number; compare_at_price: number | null; currency: string };
  availability: "InStock" | "OutOfStock";
  condition: "new" | "used" | null;
}

export interface Channel3Product {
  id: string;
  title: string;
  brands?: Array<{ id: string; name: string }>;
  offers: Channel3Offer[];
}

export interface Channel3SearchResponse {
  products: Channel3Product[];
  next_page_token: string | null;
}

export interface Channel3SearchRequest {
  query: string;
  limit: number;
  config: { country: "US"; currency: "USD" };
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

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
  if (!response.ok) {
    throw new Error(`Channel3 search failed: ${response.status} ${await response.text().catch(() => "")}`.trim());
  }
  const body = (await response.json()) as Partial<Channel3SearchResponse>;
  return { products: body.products ?? [], next_page_token: body.next_page_token ?? null };
}
