/** The three ways a deal ends by a person's choice: complete, report an issue, cancel. */
import type { Deal } from "@pay-pals/contracts";
import type { Role } from "../../role";
import type { Services } from "../../services";
import { FlowError } from "../errors";
import { ISSUE_REASON_LABELS, issueReasonsFor, type IssueReason } from "../issue";
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

/** Allowed from PAID, SHIPPED and DELIVERED; the store's transition table has the final say. */
export async function reportIssue(services: Services, dealId: string, reason: IssueReason, details = ""): Promise<Deal> {
  const deal = await mustDeal(services, dealId);
  if (!issueReasonsFor(deal.state).includes(reason)) {
    throw new FlowError(`"${ISSUE_REASON_LABELS[reason]}" is not a reason you can give while the deal is ${deal.state}.`, 409);
  }
  const label = ISSUE_REASON_LABELS[reason];
  const summary = `Issue opened: ${label.toLowerCase()}.${details ? ` ${details}` : ""}`.slice(0, 300);
  const updated = await services.store.transition(dealId, "ISSUE", "buyer", summary);
  await buildEvidence(services, dealId, "buyer");
  await say(services, dealId, "deal", "buyer_pal", `The buyer opened an issue: ${label.toLowerCase()}. An evidence pack has been built for a PayPal dispute.`);
  const tip =
    reason === "arrival_mismatch"
      ? "Open the dispute as \"significantly not as described\"."
      : "Open the dispute as \"item not received\". The tracking number and timeline are in the pack.";
  await say(services, dealId, "buyer_pal", "buyer_pal", `Issue opened. ${tip} Your payment was a Goods and Services payment, so PayPal purchase protection applies.`);
  return updated;
}

export async function cancelDeal(services: Services, dealId: string, by: Role): Promise<Deal> {
  await mustDeal(services, dealId);
  const updated = await services.store.transition(dealId, "CANCELLED", by, `Cancelled by the ${by}.`);
  await say(services, dealId, "deal", by, "I am cancelling this deal.");
  return updated;
}
