/**
 * After delivery: the Buyer Pal compares arrival photos to the locked card.
 * The result is advice. The buyer still chooses complete or report an issue.
 */
import type { ArrivalCheck, Photo } from "@pay-pals/contracts";
import type { Services } from "../../services";
import { FlowError } from "../errors";
import { expectState, mustDeal, mustLockedCard, note, say } from "./shared";

export async function checkArrival(services: Services, dealId: string, photos: Photo[]): Promise<ArrivalCheck> {
  const deal = await mustDeal(services, dealId);
  expectState(deal, "DELIVERED");
  if (photos.length === 0) throw new FlowError("Add at least one arrival photo.", 400);
  const card = await mustLockedCard(services, deal);

  await say(services, dealId, "deal", "buyer", "Arrival photos.", photos);
  const result = await services.buyerPal.checkArrival(card, photos);
  const check = await services.store.saveArrivalCheck(result.data);
  await say(services, dealId, "buyer_pal", "buyer_pal", result.palMessage);
  const summary = check.matches
    ? `Arrival matches the locked card.${check.observed.serial ? ` Serial ${check.observed.serial} confirmed.` : ""}`
    : `Arrival does not match. ${check.mismatches.map((m) => `${m.field}: card ${m.expected}, arrived ${m.observed}`).join("; ")}.`;
  // The photos ride on the event so the evidence pack can find them later.
  await note(services, dealId, "arrival_checked", "buyer_pal", summary.slice(0, 300), { photos });
  return check;
}
