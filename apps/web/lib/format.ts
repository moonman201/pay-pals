/** Formatting that renders the same on the server and in the browser. */

export function formatMoney(amount: number, currency = "USD"): string {
  return `$${amount.toFixed(2)} ${currency}`;
}

/** "2026-10-21 16:00 UTC". Fixed zone so server and client markup match. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}
