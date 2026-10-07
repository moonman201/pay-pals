/** Gather everything the store holds and hand it to the evidence pack builder. */
import type { EvidencePack } from "@pay-pals/contracts";
import type { Role } from "../../role";
import type { Services } from "../../services";
import { mustDeal, mustLockedCard, note, say } from "./shared";

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
  const result = await services.buildEvidencePack({ deal, lockedCard, verdicts, arrivalCheck, messages, payment, shipment, timeline, requestedBy });
  const pack = await store.saveEvidence(result.data);
  await note(services, dealId, "evidence_built", pack.builtBy, "Evidence pack built for a PayPal dispute.");
  await say(services, dealId, requestedBy === "buyer" ? "buyer_pal" : "seller_pal", pack.builtBy, result.palMessage);
  return pack;
}
