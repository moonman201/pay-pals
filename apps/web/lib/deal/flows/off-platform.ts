/**
 * The buyer chose to pay outside Goods and Services. Pay Pals writes the
 * line and steps back: no order, no payment, no further moves. A deal that
 * is still running is cancelled, because Pay Pals has nothing left to do on
 * it; a deal that already ended (blocked on a payment-method flag, which is
 * the case this exists for) keeps the state it ended in.
 */
import { canTransition, isTerminal, type Deal } from "@pay-pals/contracts";
import type { Services } from "../../services";
import { FlowError } from "../errors";
import { canChooseOffPlatform, hasChosenOffPlatform, OFF_PLATFORM_PAL_LINE, OFF_PLATFORM_SUMMARY } from "../off-platform";
import { mustDeal, note, say } from "./shared";

export async function chooseOffPlatform(services: Services, dealId: string): Promise<Deal> {
  const deal = await mustDeal(services, dealId);
  const events = await services.store.listEvents(dealId);
  // Pressing twice is the same choice, not a second one.
  if (hasChosenOffPlatform(events)) return deal;
  if (!canChooseOffPlatform(deal.state, events)) {
    throw new FlowError(`Paying another way is a choice before Pay Pals takes a payment, so it is not available while the deal is ${deal.state}.`, 409);
  }

  await note(services, dealId, "off_platform_chosen", "buyer", OFF_PLATFORM_SUMMARY);
  await say(services, dealId, "buyer_pal", "buyer_pal", OFF_PLATFORM_PAL_LINE);
  if (isTerminal(deal.state) || !canTransition(deal.state, "CANCELLED")) return (await services.store.getDeal(dealId)) ?? deal;
  return services.store.transition(dealId, "CANCELLED", "buyer", "The buyer is paying another way, so Pay Pals closed its part of the deal.");
}
