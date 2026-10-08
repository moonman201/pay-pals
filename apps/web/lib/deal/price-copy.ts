/**
 * One plain line for a market price check, so no screen ever shows a range
 * of "$0 to $0" or a range whose low equals its high.
 */
import type { PriceCheck } from "@pay-pals/contracts";

export const NO_PRICE = "No reliable market price found";

export function hasUsableRange(check: PriceCheck | null | undefined): check is PriceCheck {
  return Boolean(check && check.marketLow > 0 && check.marketHigh > 0 && check.marketLow < check.marketHigh);
}

export function priceSourceNote(check: PriceCheck | null | undefined): string {
  if (!check) return "no price source was available";
  return check.provider === "channel3" ? "via Channel3" : "demo prices";
}

/** "Market range $380 to $499" or "No reliable market price found". */
export function priceRangeLine(check: PriceCheck | null | undefined): string {
  return hasUsableRange(check) ? `Market range $${check.marketLow} to $${check.marketHigh}` : NO_PRICE;
}
