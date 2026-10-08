/**
 * Factory for the Seller Pal. apps/web calls createSellerPal once and reuses
 * it. Pass anthropic as null to run without a model (tests, offline demos).
 */
import type { SellerPal } from "@pay-pals/contracts";
import type { ClaudeClient } from "../claude/client";
import { isPublicMode } from "../presentation";
import type { ImageFetcher } from "../vision/fetch-image";
import { applyBuyerRequest } from "./apply-request";
import { buildCardFromListing } from "./build-card";
import { shipmentChecklistFor } from "./checklist";

export interface SellerPalOptions {
  anthropic: ClaudeClient | null;
  /** Base URL for app-relative photo paths. Defaults to PAY_PALS_PHOTO_BASE_URL or NEXT_PUBLIC_APP_URL. */
  photoBaseUrl?: string | null;
  /** Override how photos are fetched for vision. Tests pass a fake. */
  fetchImage?: ImageFetcher;
  /** Presentation only (see presentation.ts). Defaults to PAY_PALS_PUBLIC_MODE=1. */
  publicMode?: boolean;
}

export function createSellerPal(options: SellerPalOptions): SellerPal {
  const deps = { client: options.anthropic, fetchImage: options.fetchImage, photoBaseUrl: options.photoBaseUrl ?? null, publicMode: isPublicMode(options.publicMode) };
  return {
    buildCard: (input) => buildCardFromListing(input, deps),
    applyRequest: (card, request, reply, newPhotos) => applyBuyerRequest(card, request, reply, newPhotos, deps),
    shipmentChecklist: async (deal, lockedCard) => shipmentChecklistFor(deal, lockedCard),
  };
}
