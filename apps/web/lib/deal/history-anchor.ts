/**
 * Where the deal's chain head stands against PayPal's own copy
 * (HISTORY_ANCHORS, PLAN.md Decisions 15 and 17).
 *
 * One value, decided once, where the live read is. Before this the evidence
 * page worked it out again from the shape of the order id, which agreed with
 * `isExampleDeal` only because both looked at the same FIXTURE- prefix. A
 * prefix is a convention, not a contract, and two ends deriving one fact is
 * how they drift.
 *
 * Conservative by construction: `corroborated` is reachable only from a live
 * read that came back carrying the same hash, and everything else falls to
 * `recorded_only` or `not_anchored`, neither of which claims corroboration.
 */
import { parseCustomId, type HistoryAnchor, type PaymentRecord } from "@pay-pals/contracts";
import type { PayPalReadResult } from "./paypal-confirmation";

export function historyAnchorFor(read: PayPalReadResult, payment: PaymentRecord | null): HistoryAnchor {
  // No order at all, so there is nothing anywhere to compare against.
  if (!payment) return "not_anchored";

  switch (read.kind) {
    case "confirmed": {
      // PayPal answered. What it holds in custom_id is the only thing that can corroborate.
      const onOrder = read.order.customId ? parseCustomId(read.order.customId).historyHash : null;
      if (!onOrder) return "not_anchored";
      if (!payment.historyHash) return "not_anchored";
      return onOrder === payment.historyHash ? "corroborated" : "not_anchored";
    }
    // A placeholder or an in-process id: no PayPal order holds anything.
    case "example":
    case "mock":
      return "not_anchored";
    case "none":
      return "not_anchored";
    case "failed":
      // A real order exists and we could not read it back, so all we have is our own record.
      return payment.historyHash ? "recorded_only" : "not_anchored";
  }
}

/** Absent is read as recorded_only, the conservative case: it never claims corroboration. */
export function anchorOf(anchor: HistoryAnchor | undefined): HistoryAnchor {
  return anchor ?? "recorded_only";
}

export interface AnchorCopy {
  /** One plain sentence about where the hash stands. */
  text: string;
  /** True only for `corroborated`: PayPal's own record was read and agrees. */
  corroborated: boolean;
}

/**
 * What the evidence pack says about the anchor. Never more than the value
 * allows: `recorded_only` says the comparison is against our own record, and
 * `not_anchored` says nothing at PayPal holds it.
 */
export function anchorCopy(anchor: HistoryAnchor | undefined, orderId: string | null): AnchorCopy {
  const order = orderId ? `order ${orderId}` : "the PayPal order";
  switch (anchorOf(anchor)) {
    case "corroborated":
      return {
        text: `PayPal's own record of ${order} was read for this pack, and the hash in its custom_id is the one recorded here. The chain is corroborated by PayPal, not only by us.`,
        corroborated: true,
      };
    case "recorded_only":
      return {
        text: `Pay Pals recorded this hash with ${order} when the order was created, and it was not read back from PayPal for this pack. The check below is against our own record of it, not against PayPal's copy.`,
        corroborated: false,
      };
    case "not_anchored":
      return {
        text: "No PayPal order holds this hash. The stored events are still chained, so an edit would break the chain, but there is nothing at PayPal to compare them against.",
        corroborated: false,
      };
  }
}
