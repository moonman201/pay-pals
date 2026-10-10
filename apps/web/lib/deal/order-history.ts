/**
 * The history hash as PayPal holds it. The deal's event chain head goes into
 * the order's custom_id when the order is created (Decision 9), so a live
 * read of the order gives us a hash we never stored, and the stored timeline
 * either reproduces it or does not. Pure: parseCustomId and
 * historyMatchesHead from the contracts do the work.
 */
import { historyMatchesHead, parseCustomId, type DealEvent } from "@pay-pals/contracts";

export interface OrderHistory {
  /** custom_id exactly as PayPal returned it. */
  customId: string;
  /** The deal id PayPal holds on the order. */
  dealIdOnOrder: string;
  /** The chain head PayPal holds, or null when the order carries only a deal id. */
  historyHash: string | null;
  /** PayPal's deal id is the deal this page is showing. */
  dealIdMatches: boolean;
  /** The stored events reproduce the hash PayPal holds. Null when there is no hash to check. */
  matches: boolean | null;
  /** How many stored events the check ran over. */
  events: number;
}

/** Null when PayPal returned no custom_id, which means there is nothing to show. */
export function checkOrderHistory(customId: string | null, dealId: string, events: readonly DealEvent[]): OrderHistory | null {
  if (!customId) return null;
  const parsed = parseCustomId(customId);
  return {
    customId,
    dealIdOnOrder: parsed.dealId,
    historyHash: parsed.historyHash,
    dealIdMatches: parsed.dealId === dealId,
    matches: parsed.historyHash ? historyMatchesHead(events, parsed.historyHash) : null,
    events: events.length,
  };
}

function eventWord(n: number): string {
  return `${n} ${n === 1 ? "event" : "events"}`;
}

/** One plain sentence for what the check found. */
export function orderHistoryLine(check: OrderHistory): string {
  if (check.matches === null) return "PayPal holds the deal id on this order, but no history hash. Only an order created with the chain head carries one.";
  if (check.matches) return `The hash PayPal holds reproduces from the ${eventWord(check.events)} stored here, so the timeline has not changed since the order was created.`;
  return `The hash PayPal holds does not reproduce from the ${eventWord(check.events)} stored here. Either the timeline changed after the order, or these are not its events.`;
}

/** Said only when PayPal's deal id is some other deal, which should never happen. */
export function dealIdWarning(check: OrderHistory): string | null {
  return check.dealIdMatches ? null : `The deal id on this order is ${check.dealIdOnOrder}, which is not the deal on this page.`;
}
