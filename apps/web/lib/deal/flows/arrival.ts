/**
 * After delivery: the Buyer Pal compares arrival photos to the locked card.
 * The result is advice. The buyer still chooses complete or report an issue.
 */
import type { ArrivalCheck, Photo } from "@pay-pals/contracts";
import type { Services } from "../../services";
import { FlowError } from "../errors";
import { absoluteCard, absolutePhotos } from "../photo-urls";
import { expectState, mustDeal, mustLockedCard, note, say } from "./shared";

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
    // No claim about where the serial came from: ArrivalCheck.observed carries no provenance,
    // so the event says the number the pal reports and leaves the rest to the pal's own reasons.
    ? `Arrival matches the locked card.${check.observed.serial ? ` The serial the Buyer Pal reports, ${check.observed.serial}, is the one on the card.` : ""}`
    : `Arrival does not match. ${check.mismatches.map((m) => `${m.field}: card ${m.expected}, arrived ${m.observed}`).join("; ")}.`;
  // The photos ride on the event so the evidence pack can find them later.
  await note(services, dealId, "arrival_checked", "buyer_pal", summary.slice(0, 300), { photos });
  return check;
}
