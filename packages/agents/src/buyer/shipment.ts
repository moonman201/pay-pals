/**
 * BuyerPal.checkShipment: at ship time, every required checklist item the
 * seller skipped, and an empty packing-photo list when the checklist asks
 * for photos, raise MISSING_PACKING_PHOTO (caution). Deterministic, no model.
 */
import type { ChecklistItem, ItemCard, PalResult, RedFlag, Shipment } from "@pay-pals/contracts";
import { sentences } from "../copy";

const PHOTO_ITEM = /\bphoto\b/i;
export const MISSING_PHOTO_EXPLANATION = "Shipped with no photo of the item going into the box.";
export const NO_PACKING_PHOTOS_EVIDENCE = "No packing photos were added to the shipment";

function flagFor(item: ChecklistItem): RedFlag {
  return {
    code: "MISSING_PACKING_PHOTO",
    severity: "caution",
    evidence: `Packing step not done: ${item.label}`,
    explanation: PHOTO_ITEM.test(item.label) ? MISSING_PHOTO_EXPLANATION : `Shipped without finishing a required step: ${item.label}.`,
    raisedByRule: true,
  };
}

export function shipmentFlags(shipment: Shipment): RedFlag[] {
  const missing = shipment.checklist.filter((item) => item.required && !item.done);
  const flags = missing.map(flagFor);
  const asksForPhotos = shipment.checklist.some((item) => PHOTO_ITEM.test(item.label));
  const photoItemFlagged = missing.some((item) => PHOTO_ITEM.test(item.label));
  if (asksForPhotos && shipment.packingPhotos.length === 0 && !photoItemFlagged) {
    flags.push({ code: "MISSING_PACKING_PHOTO", severity: "caution", evidence: NO_PACKING_PHOTOS_EVIDENCE, explanation: MISSING_PHOTO_EXPLANATION, raisedByRule: true });
  }
  return flags;
}

export function checkShipmentAgainstCard(card: ItemCard, shipment: Shipment): PalResult<RedFlag[]> {
  const flags = shipmentFlags(shipment);
  const missingLabels = shipment.checklist.filter((item) => item.required && !item.done).map((item) => item.label);
  const photosMissing = flags.some((f) => f.evidence === NO_PACKING_PHOTOS_EVIDENCE);
  const palMessage = sentences(
    `The seller shipped ${card.title} with ${shipment.carrier}, tracking ${shipment.trackingNumber}.`,
    flags.length === 0 ? "The seller shipped with every packing photo." : null,
    missingLabels.length === 1 ? `One required packing step is missing: ${missingLabels[0]}.` : null,
    missingLabels.length > 1 ? `${missingLabels.length} required packing steps are missing: ${missingLabels.join("; ")}.` : null,
    photosMissing ? "No packing photos were added." : null,
    flags.length > 0 ? "I have noted this for the evidence pack. Check the item carefully when it arrives." : null,
  );
  return { data: flags, palMessage };
}
