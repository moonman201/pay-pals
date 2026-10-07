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
export { runRules, overallFromFlags, type RuleInput, type SellerIdentity } from "./rules";
export { createAnthropicClientFromEnv, modelId, DEFAULT_MODEL, type ClaudeClient } from "./claude/client";
export { fetchImage, isFetchableUrl, type ImageFetcher } from "./vision/fetch-image";
export { plainCopy } from "./copy";
