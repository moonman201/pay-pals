/** One call builds the whole fixture-backed service set. */
import { ALL_FIXTURES } from "@pay-pals/contracts";
import type { Services } from "../services";
import { createMockBuyerPal } from "./buyer-pal";
import { buildMockEvidencePack } from "./evidence-builder";
import { createMemoryDealStore } from "./memory-store";
import { createMockPayPalGateway } from "./paypal-gateway";
import { seedFixtures } from "./seed";
import { createMockSellerPal } from "./seller-pal";

export function createMockServices(): Services {
  const store = createMemoryDealStore();
  const ready = seedFixtures(store, ALL_FIXTURES);
  return {
    store,
    sellerPal: createMockSellerPal(),
    buyerPal: createMockBuyerPal(),
    paypal: createMockPayPalGateway(),
    buildEvidencePack: buildMockEvidencePack,
    ready,
  };
}
