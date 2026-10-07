/** Browser-side fetch helper for the deal API routes. */
export async function postJson<T = { ok: true }>(url: string, body: unknown = {}): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
  return data;
}

export function dealApi(dealId: string, action: string): string {
  return `/api/deals/${encodeURIComponent(dealId)}/${action}`;
}
