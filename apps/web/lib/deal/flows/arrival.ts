/**
 * After delivery: the Buyer Pal compares arrival photos to the locked card.
 * The result is advice. The buyer still chooses complete or report an issue.
 */
import type { ArrivalCheck, Photo } from "@pay-pals/contracts";
import type { Services } from "../../services";
import { FlowError } from "../errors";
import { absoluteCard, absolutePhotos } from "../photo-urls";
import { expectState, mustDeal, mustLockedCard, note, say } from "./shared";

/** The serial on the check and where it came from, in the Buyer Pal's own terms. */
function arrivalSerialLine(check: ArrivalCheck): string {
  const serial = check.observed.serial;
  if (!serial) return "";
  if (check.observed.serialSource === "photo") return ` Serial ${serial} was read off the picture of the item itself.`;
  if (check.observed.serialSource === "description") return ` The serial ${serial} comes from the description filed with the photo, so it is the buyer's word.`;
  return ` The serial the Buyer Pal reports, ${serial}, is the one on the card.`;
}

export async function checkArrival(services: Services, dealId: string, photos: Photo[]): Promise<ArrivalCheck> {
  const deal = await mustDeal(services, dealId);
  expectState(deal, "DELIVERED");
  if (photos.length === 0) throw new FlowError("Add at least one arrival photo.", 400);
  const card = await mustLockedCard(services, deal);

  await say(services, dealId, "deal", "buyer", "Arrival photos.", photos);
  const result = await services.buyerPal.checkArrival(absoluteCard(card), absolutePhotos(photos));
  // The check keeps its photos (contract v1.3.0), stored as given (relative), whatever the pal echoed back.
  const check = await services.store.saveArrivalCheck({ ...result.data, photos });
  await say(services, dealId, "buyer_pal", "buyer_pal", result.palMessage);
  const summary = check.matches
    // Where the number came from, from observed.serialSource and nowhere else (Decision 15).
    ? `Arrival matches the locked card.${arrivalSerialLine(check)}`
    : `Arrival does not match. ${check.mismatches.map((m) => `${m.field}: card ${m.expected}, arrived ${m.observed}`).join("; ")}.`;
  // The photos ride on the event so the evidence pack can find them later.
  await note(services, dealId, "arrival_checked", "buyer_pal", summary.slice(0, 300), { photos });
  return check;
}
