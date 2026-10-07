/**
 * Contracts carry dollars (475.5). The database stores integer cents (47550).
 */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}
