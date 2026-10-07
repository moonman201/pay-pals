/** Plain words for the enums the contracts use. */
import type { Actor, Deal, DealState, VerdictOverall } from "@pay-pals/contracts";

export const STATE_LABELS: Readonly<Record<DealState, string>> = {
  DRAFT: "Draft",
  INVITED: "Waiting for the seller",
  LISTED: "Listed",
  REVIEWED: "Reviewed",
  AGREED: "Agreed, card locked",
  PAYMENT_PENDING: "Payment pending",
  PAID: "Paid",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  COMPLETE: "Complete",
  BLOCKED: "Blocked",
  ISSUE: "Issue open",
  CANCELLED: "Cancelled",
};

export const OVERALL_LABELS: Readonly<Record<VerdictOverall, string>> = {
  go: "Go",
  caution: "Caution",
  stop: "Stop",
};

export function actorLabel(actor: Actor, deal: Deal): string {
  switch (actor) {
    case "buyer":
      return deal.buyer?.displayName ?? "Buyer";
    case "seller":
      return deal.seller.displayName;
    case "buyer_pal":
      return "Buyer Pal";
    case "seller_pal":
      return "Seller Pal";
    case "paypal":
      return "PayPal";
    case "system":
      return "Pay Pals";
  }
}
