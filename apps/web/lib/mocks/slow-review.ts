/**
 * A test knob: make the Buyer Pal's review take a fixed time, so a run that
 * is still going when a client leaves can be reproduced without spending a
 * model call. PAY_PALS_REVIEW_DELAY_MS unset, empty or not a positive number
 * leaves the pal untouched.
 */
import type { BuyerPal } from "@pay-pals/contracts";

export function reviewDelayMs(value: string | undefined): number {
  const n = Number(value?.trim());
  return Number.isFinite(n) && n > 0 ? Math.min(n, 120_000) : 0;
}

export function withReviewDelay(pal: BuyerPal, ms: number): BuyerPal {
  if (ms <= 0) return pal;
  return {
    ...pal,
    review: async (card, chat, context, options) => {
      options?.onProgress?.({ kind: "stage", stage: "reading the listing" });
      await new Promise((resolve) => setTimeout(resolve, ms));
      return pal.review(card, chat, context, options);
    },
  };
}
