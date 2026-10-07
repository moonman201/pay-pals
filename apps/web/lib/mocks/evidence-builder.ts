/**
 * Mock evidence pack builder. Gathers what the store already holds and
 * writes a plain summary a dispute reviewer can read in one minute.
 */
import { CONDITION_LABELS, type EvidenceInput, type EvidencePack, type EvidencePackBuilder, type PalResult, type Photo } from "@pay-pals/contracts";
import { formatTime } from "../format";
import { nowIso } from "./ids";

function uniquePhotos(lists: Photo[][]): Photo[] {
  const seen = new Set<string>();
  const out: Photo[] = [];
  for (const p of lists.flat()) {
    if (seen.has(p.url)) continue;
    seen.add(p.url);
    out.push(p);
  }
  return out;
}

function money(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function summarize(input: EvidenceInput): string {
  const { deal, lockedCard, payment, shipment, arrivalCheck, verdicts } = input;
  const lines: string[] = [];
  const buyer = deal.buyer?.displayName ?? "The buyer";
  lines.push(
    `${deal.seller.displayName} sold ${buyer} a ${lockedCard.title} (${lockedCard.brand} ${lockedCard.model}, serial ${lockedCard.serial ?? "not recorded"}, condition ${CONDITION_LABELS[lockedCard.conditionGrade]}) for ${money(lockedCard.askingPrice)}. Both sides agreed to card version ${lockedCard.version}, locked ${lockedCard.lockedAt ? formatTime(lockedCard.lockedAt) : "at an unrecorded time"}. The card lists: ${lockedCard.included.join(", ")}.`,
  );
  const review = verdicts[verdicts.length - 1];
  if (review) {
    lines.push(`Before payment the Buyer Pal reviewed the card and said ${review.overall}${review.flags.length ? ` with ${review.flags.length} flags` : " with no flags"}.`);
  }
  if (payment) {
    lines.push(
      `The buyer paid ${money(payment.amount)} through a PayPal Goods and Services checkout order (${payment.paypalOrderId}${payment.captureId ? `, capture ${payment.captureId}` : ""}) to ${payment.payeeEmail}${payment.method ? ` using ${payment.method === "venmo" ? "Venmo" : "PayPal"}` : ""}. Status ${payment.status}.`,
    );
  } else {
    lines.push("No payment was made.");
  }
  if (shipment) {
    lines.push(
      `The seller shipped with ${shipment.carrier}, tracking ${shipment.trackingNumber}, on ${formatTime(shipment.shippedAt)}, with ${shipment.packingPhotos.length} packing photos. ${shipment.deliveredAt ? `Delivery was confirmed on ${formatTime(shipment.deliveredAt)}.` : "Delivery has not been confirmed."}`,
    );
  }
  if (arrivalCheck) {
    if (arrivalCheck.matches) {
      lines.push("The Buyer Pal compared the arrival photos to the locked card and found a match.");
    } else {
      const details = arrivalCheck.mismatches.map((m) => `${m.field}: the card says ${m.expected}, the item that arrived shows ${m.observed}`).join("; ");
      lines.push(`The Buyer Pal compared the arrival photos to the locked card and found it does not match. ${details}.`);
    }
  }
  lines.push(`This pack was requested by the ${input.requestedBy}. It holds the locked card, the review, the shared chat, every photo, the payment record, the shipment record and the full timeline.`);
  return lines.join("\n\n");
}

export const buildMockEvidencePack: EvidencePackBuilder = async (input: EvidenceInput): Promise<PalResult<EvidencePack>> => {
  const pack: EvidencePack = {
    dealId: input.deal.id,
    builtBy: input.requestedBy === "buyer" ? "buyer_pal" : "seller_pal",
    builtAt: nowIso(),
    lockedCard: input.lockedCard,
    verdicts: input.verdicts,
    arrivalCheck: input.arrivalCheck,
    messages: input.messages.filter((m) => m.channel === "deal"),
    photos: uniquePhotos([input.lockedCard.photos, input.shipment?.packingPhotos ?? [], input.messages.flatMap((m) => m.photos), input.arrivalPhotos ?? []]),
    payment: input.payment,
    shipment: input.shipment,
    timeline: input.timeline,
    summary: summarize(input),
  };
  return { data: pack, palMessage: "Evidence pack built. It is ready to attach to a PayPal dispute." };
};
