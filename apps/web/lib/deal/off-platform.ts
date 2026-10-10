/**
 * The buyer's choice to pay outside PayPal Goods and Services (PLAN.md
 * Decision 12).
 *
 * Pay Pals only ever creates a Goods and Services checkout payment. Anyone
 * can start a deal and get the full set of checks whatever they mean to pay
 * with, and if the buyer then decides to pay another way, Pay Pals tells
 * them the truth, writes the line, and steps back. It never processes that
 * payment and never sees it.
 *
 * This file is the rule and the words. The flow does the writing.
 */
import { isTerminal, type DealEvent, type DealState } from "@pay-pals/contracts";

export const OFF_PLATFORM_EVENT = "off_platform_chosen" as const;

/**
 * Where the choice is offered: while the buyer is deciding how to pay, and
 * on a deal the Buyer Pal blocked on a payment-method flag, which is the
 * case that matters. Never after Pay Pals has taken a payment of its own.
 */
export const OFF_PLATFORM_STATES: readonly DealState[] = ["REVIEWED", "AGREED", "PAYMENT_PENDING", "BLOCKED"];

export function hasChosenOffPlatform(events: readonly DealEvent[]): boolean {
  return events.some((e) => e.kind === OFF_PLATFORM_EVENT);
}

export function canChooseOffPlatform(state: DealState, events: readonly DealEvent[]): boolean {
  return OFF_PLATFORM_STATES.includes(state) && !hasChosenOffPlatform(events);
}

/** The line Matt wrote. It appears on the warning, in the event, and in the room afterwards. */
export const ON_YOUR_OWN = "You're on your own from here: no PayPal protection and no dispute path.";

/** The whole warning, in order. Plain, not a scolding and not a nudge either way. */
export const OFF_PLATFORM_WARNING: readonly string[] = [
  "Pay Pals only ever creates a PayPal Goods and Services payment. If you pay another way, Pay Pals does not handle that payment and cannot see it.",
  ON_YOUR_OWN,
  "Everything your pal checked stays on this deal and you can keep reading it. Pay Pals records that you chose to pay another way, and then it steps back.",
];

export const OFF_PLATFORM_CHECKBOX = "I understand: no PayPal protection and no dispute path on a payment made another way.";

export const OFF_PLATFORM_BUTTON = "I will pay another way";

/** The timeline line. Says what the buyer told us, not what they did. */
export const OFF_PLATFORM_SUMMARY = `The buyer said they will pay outside PayPal Goods and Services. ${ON_YOUR_OWN} Pay Pals created no order and stepped back.`;

/** The pal's own line in the buyer's pane. No scolding. */
export const OFF_PLATFORM_PAL_LINE = `Understood. I am not handling that payment and I will not see it, so ${ON_YOUR_OWN.charAt(0).toLowerCase()}${ON_YOUR_OWN.slice(1)} Everything I checked stays on this page, and the item card and my review are yours to keep.`;

/** What the room says once the choice is made. */
export function offPlatformNotice(state: DealState): string {
  const ending = isTerminal(state) && state !== "CANCELLED" ? "This deal was already closed before that." : "Pay Pals closed its part of the deal here.";
  return `You chose to pay outside PayPal Goods and Services. ${ending} Pay Pals created no order, is not handling your payment, and has no record of it. ${ON_YOUR_OWN} Everything your pal checked is still on this page.`;
}

/** Said when something tries to create an order on a deal that went off platform. */
export const OFF_PLATFORM_ORDER_REFUSED = "This deal was taken off Pay Pals: the buyer chose to pay another way, so Pay Pals will not create an order for it.";
