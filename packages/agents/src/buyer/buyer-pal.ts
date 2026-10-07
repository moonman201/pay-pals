/**
 * Factory for the Buyer Pal. apps/web calls createBuyerPal once and reuses it.
 * Pass anthropic as null to run rules only (no key, tests, offline demos).
 */
import type { BuyerPal, ItemCard, MarketPriceLookup, Message, Photo } from "@pay-pals/contracts";
import type { ClaudeClient } from "../claude/client";
import type { ImageFetcher } from "../vision/fetch-image";
import { checkArrivalAgainstCard } from "./arrival";
import { reviewCard, type ReviewContext } from "./review";

export interface BuyerPalOptions {
  anthropic: ClaudeClient | null;
  priceLookup: MarketPriceLookup;
  /** Override how photos are fetched for vision. Tests pass a fake. */
  fetchImage?: ImageFetcher;
}

/** BuyerPal plus an optional review context the contract does not carry yet. */
export interface BuyerPalWithContext extends BuyerPal {
  review(card: ItemCard, chatTranscript: Message[], context?: ReviewContext): ReturnType<BuyerPal["review"]>;
  checkArrival(lockedCard: ItemCard, arrivalPhotos: Photo[]): ReturnType<BuyerPal["checkArrival"]>;
}

export function createBuyerPal(options: BuyerPalOptions): BuyerPalWithContext {
  const client = options.anthropic;
  return {
    review: (card, chat, context) => reviewCard(card, chat, context, { client, priceLookup: options.priceLookup }),
    checkArrival: (card, photos) => checkArrivalAgainstCard(card, photos, { client, fetchImage: options.fetchImage }),
  };
}
