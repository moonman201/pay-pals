/**
 * Factory for the Buyer Pal. apps/web calls createBuyerPal once and reuses it.
 * Pass anthropic as null to run rules only (no key, tests, offline demos).
 */
import type { BuyerPal, CertLookup, MarketPriceLookup } from "@pay-pals/contracts";
import type { ClaudeClient } from "../claude/client";
import type { ImageFetcher } from "../vision/fetch-image";
import { checkArrivalAgainstCard } from "./arrival";
import { reviewCard } from "./review";

export interface BuyerPalOptions {
  anthropic: ClaudeClient | null;
  priceLookup: MarketPriceLookup;
  /** Grading certificate lookup. Without it a card with a certNumber is not checked. */
  certLookup?: CertLookup | null;
  /** Override how photos are fetched for vision. Tests pass a fake. */
  fetchImage?: ImageFetcher;
}

export function createBuyerPal(options: BuyerPalOptions): BuyerPal {
  const client = options.anthropic;
  return {
    review: (card, chat, context) => reviewCard(card, chat, context, { client, priceLookup: options.priceLookup, certLookup: options.certLookup ?? null }),
    checkArrival: (card, photos) => checkArrivalAgainstCard(card, photos, { client, fetchImage: options.fetchImage }),
  };
}
