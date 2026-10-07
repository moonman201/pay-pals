/** Gather everything the store holds and hand it to the evidence pack builder. */
import { PhotoSchema, type Deal, type DealEvent, type EvidencePack, type Photo } from "@pay-pals/contracts";
import { fixtureById } from "../../scenarios";
import type { Role } from "../../role";
import type { Services } from "../../services";
import { mustDeal, mustLockedCard, note, say } from "./shared";

/** The buyer's arrival photos: from the arrival_checked event, or the scenario fixture for a seeded finished deal. */
export function arrivalPhotosFrom(deal: Deal, timeline: DealEvent[]): Photo[] {
  const event = [...timeline].reverse().find((e) => e.kind === "arrival_checked" && Array.isArray(e.data?.photos));
  if (event) {
    const parsed = PhotoSchema.array().safeParse(event.data?.photos);
    if (parsed.success) return parsed.data;
  }
  return fixtureById(deal.scenario)?.arrivalPhotos ?? [];
}

export async function buildEvidence(services: Services, dealId: string, requestedBy: Role): Promise<EvidencePack> {
  const deal = await mustDeal(services, dealId);
  const lockedCard = await mustLockedCard(services, deal);
  const { store } = services;
  const [verdicts, arrivalCheck, messages, payment, shipment, timeline] = await Promise.all([
    store.listVerdicts(dealId),
    store.getArrivalCheck(dealId),
    store.listMessages(dealId),
    store.getPayment(dealId),
    store.getShipment(dealId),
    store.listEvents(dealId),
  ]);
  const arrivalPhotos = arrivalCheck ? arrivalPhotosFrom(deal, timeline) : [];
  const result = await services.buildEvidencePack({ deal, lockedCard, verdicts, arrivalCheck, messages, payment, shipment, timeline, arrivalPhotos, requestedBy });
  const pack = await store.saveEvidence(result.data);
  await note(services, dealId, "evidence_built", pack.builtBy, "Evidence pack built for a PayPal dispute.");
  await say(services, dealId, requestedBy === "buyer" ? "buyer_pal" : "seller_pal", pack.builtBy, result.palMessage);
  return pack;
}
