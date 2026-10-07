/** The three ways a deal ends by a person's choice: complete, report an issue, cancel. */
import type { Deal } from "@pay-pals/contracts";
import type { Role } from "../../role";
import type { Services } from "../../services";
import { buildEvidence } from "./evidence";
import { expectState, mustDeal, say } from "./shared";

export async function completeDeal(services: Services, dealId: string): Promise<Deal> {
  const deal = await mustDeal(services, dealId);
  expectState(deal, "DELIVERED");
  const updated = await services.store.transition(dealId, "COMPLETE", "buyer", "Complete.");
  await say(services, dealId, "deal", "buyer", "Received and it matches. Thanks.");
  await say(services, dealId, "buyer_pal", "buyer_pal", "Done. I kept the locked card, the payment record and the photos in case you ever need them.");
  await say(services, dealId, "seller_pal", "seller_pal", "The buyer confirmed the item matches. This deal is complete.");
  return updated;
}

export async function reportIssue(services: Services, dealId: string): Promise<Deal> {
  const deal = await mustDeal(services, dealId);
  expectState(deal, "DELIVERED");
  const updated = await services.store.transition(dealId, "ISSUE", "buyer", "Issue opened.");
  await buildEvidence(services, dealId, "buyer");
  await say(services, dealId, "deal", "buyer_pal", "The buyer reported that the item does not match the locked card. An evidence pack has been built for a PayPal dispute.");
  return updated;
}

export async function cancelDeal(services: Services, dealId: string, by: Role): Promise<Deal> {
  await mustDeal(services, dealId);
  const updated = await services.store.transition(dealId, "CANCELLED", by, `Cancelled by the ${by}.`);
  await say(services, dealId, "deal", by, "I am cancelling this deal.");
  return updated;
}
