/**
 * The service seam. This is the only file that decides which implementation
 * of each contract interface the app uses. Server code calls getServices();
 * nothing else imports a mock or a package directly.
 *
 * To switch to the real packages, replace createMockServices() below with
 * the constructors from @pay-pals/db, @pay-pals/agents and @pay-pals/paypal
 * and add those packages to transpilePackages in next.config.ts.
 */
import type { BuyerPal, DealStore, EvidencePackBuilder, PayPalGateway, SellerPal } from "@pay-pals/contracts";
import { createMockServices } from "./mocks";

export interface Services {
  store: DealStore;
  sellerPal: SellerPal;
  buyerPal: BuyerPal;
  paypal: PayPalGateway;
  buildEvidencePack: EvidencePackBuilder;
  /** Resolves once any seeding or warm-up has finished. */
  ready: Promise<void>;
}

const globalRef = globalThis as typeof globalThis & { __payPalsServices?: Services };

/** One instance per server process. Kept on globalThis so dev hot reloads do not lose demo deals. */
export function getServices(): Services {
  if (!globalRef.__payPalsServices) globalRef.__payPalsServices = createMockServices();
  return globalRef.__payPalsServices;
}
