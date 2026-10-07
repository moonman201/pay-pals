/**
 * SellerPal.shipmentChecklist: the packing and shipping steps for a locked
 * card. Deterministic; the steps are the same for every deal and the proof
 * they produce is what the evidence pack leans on.
 */
import type { ChecklistItem, Deal, ItemCard, PalResult } from "@pay-pals/contracts";
import { MONEY_MOVED_STATES } from "@pay-pals/contracts";
import { sentences } from "../copy";

function naturalList(items: string[]): string {
  const lower = items.map((i) => i.toLowerCase());
  if (lower.length === 0) return "item";
  if (lower.length === 1) return lower[0]!;
  return `${lower.slice(0, -1).join(", ")} and ${lower[lower.length - 1]}`;
}

export function shipmentChecklistFor(deal: Deal, lockedCard: ItemCard): PalResult<ChecklistItem[]> {
  const paid = MONEY_MOVED_STATES.includes(deal.state);
  const contents = naturalList(lockedCard.included.length > 0 ? lockedCard.included : [lockedCard.title]);
  const items: ChecklistItem[] = [
    ...(paid ? [] : [{ id: "wait_for_payment", label: "Wait until the payment shows as captured before you pack anything", required: true, done: false }]),
    { id: "photo_packing", label: `Photo of the ${contents} going into the shipping box`, required: true, done: false },
    { id: "photo_sealed", label: "Photo of the sealed box with the shipping label on it", required: true, done: false },
    { id: "tracking", label: "Enter the carrier and tracking number", required: true, done: false },
    { id: "address", label: "Ship to the address on the PayPal order only", required: true, done: false },
  ];
  const palMessage = sentences(
    paid ? "Payment is in. Four steps before this is done." : "Do not pack anything until the payment shows as captured.",
    `Take a photo of the ${contents} going into the box, then one of the sealed box with the label.`,
    lockedCard.serial ? `Make sure the serial ${lockedCard.serial} is visible in the packing photo.` : null,
    "Ship only to the address on the PayPal order. Give me the carrier and tracking number and I will post it on the timeline.",
  );
  return { data: items, palMessage };
}
