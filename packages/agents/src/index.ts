/**
 * Public surface of @pay-pals/agents. apps/web wires these up; nothing else
 * in the repo reaches past this file.
 */
export { createBuyerPal, type BuyerPalOptions } from "./buyer/buyer-pal";
export { createSellerPal, type SellerPalOptions } from "./seller/seller-pal";
export { CardLockedError } from "./seller/apply-request";
export { MissingPriceError } from "./seller/build-card";
export { buildEvidencePack, createEvidencePackBuilder, type EvidencePackOptions } from "./evidence/build-evidence-pack";
export { createChannel3PriceLookup, type Channel3Options } from "./price/channel3-lookup";
export { Channel3Error, channel3CallCount } from "./price/channel3-api";
export { createFixturePriceLookup } from "./price/fixture-lookup";
export { createPsaCertLookup, type PsaOptions } from "./cert/psa-lookup";
export { createFixtureCertLookup, isNotChecked } from "./cert/fixture-lookup";
export { NOT_CHECKED_EXPLANATION } from "./cert/compare";
export { PsaError, psaCallCount } from "./cert/psa-api";
export { compareCertRecord } from "./cert/compare";
export { shipmentFlags } from "./buyer/shipment";
export { unansweredQuestions } from "./evidence/unanswered";
export { runRules, overallFromFlags, type RuleInput, type SellerIdentity } from "./rules";
export { createAnthropicClientFromEnv, modelId, DEFAULT_MODEL, type ClaudeClient } from "./claude/client";
export { fetchImage, isFetchableUrl, resolvePhotoUrl, type ImageFetcher } from "./vision/fetch-image";
export { imageHash, hammingDistance, NEAR_DUPLICATE_DISTANCE } from "./vision/phash";
export type { KnownPhoto } from "./buyer/photo-match";
export { plainCopy } from "./copy";
export { isPublicMode } from "./presentation";
