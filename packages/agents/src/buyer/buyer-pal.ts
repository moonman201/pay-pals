/**
 * Factory for the Buyer Pal. apps/web calls createBuyerPal once and reuses it.
 * Pass anthropic as null to run rules only (no key, tests, offline demos).
 */
import type { BuyerPal, CertLookup, MarketPriceLookup } from "@pay-pals/contracts";
import type { ClaudeClient } from "../claude/client";
import type { ImageFetcher } from "../vision/fetch-image";
import { checkArrivalAgainstCard } from "./arrival";
import type { KnownPhoto } from "./photo-match";
import { reviewCard } from "./review";

export interface BuyerPalOptions {
  anthropic: ClaudeClient | null;
  priceLookup: MarketPriceLookup;
  /** Grading certificate lookup. Without it a card with a certNumber is not checked. */
  certLookup?: CertLookup | null;
  /** Photos from other finished deals and the reference set. A card photo that is the same picture raises STOCK_OR_REUSED_PHOTO. */
  knownPhotos?: KnownPhoto[];
  /** Base URL for app-relative photo paths such as /fixtures/clean-ps5/front.jpg. Defaults to PAY_PALS_PHOTO_BASE_URL or NEXT_PUBLIC_APP_URL. */
  photoBaseUrl?: string | null;
  /** Override how photos are fetched for vision. Tests pass a fake. */
  fetchImage?: ImageFetcher;
}

export function createBuyerPal(options: BuyerPalOptions): BuyerPal {
  const client = options.anthropic;
  const photos = { fetchImage: options.fetchImage, photoBaseUrl: options.photoBaseUrl ?? null };
  const hashCache = new Map<string, string | null>();
  return {
    review: (card, chat, context) =>
      reviewCard(card, chat, context, {
        client,
        priceLookup: options.priceLookup,
        certLookup: options.certLookup ?? null,
        photoMatch: { knownPhotos: options.knownPhotos ?? [], hashCache, ...photos },
        ...photos,
      }),
    checkArrival: (card, arrivalPhotos) => checkArrivalAgainstCard(card, arrivalPhotos, { client, ...photos }),
  };
}
