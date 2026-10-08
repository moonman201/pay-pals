/** Gather everything the store holds and hand it to the evidence pack builder. */
import { historyMatchesHead, PhotoSchema, type ArrivalCheck, type Deal, type DealEvent, type EvidencePack, type Photo } from "@pay-pals/contracts";
import type { Role } from "../../role";
import { fixtureById } from "../../scenarios";
import type { Services } from "../../services";
import { FlowError, notFound } from "../errors";
import { absoluteCard, absoluteMessages, absolutePhotos, absoluteUrl } from "../photo-urls";
import { mustDeal, note, say } from "./shared";

type EvidenceServices = Pick<Services, "store" | "buildEvidencePack">;

/** Maps a photo the builder returned (absolute URL) back to the stored photo (relative URL) when it is one of ours. */
function relativizer(stored: readonly Photo[]): (photo: Photo) => Photo {
  const byAbsolute = new Map(stored.map((p) => [absoluteUrl(p.url), p] as const));
  return (photo) => byAbsolute.get(photo.url) ?? byAbsolute.get(absoluteUrl(photo.url)) ?? photo;
}

/** The buyer's arrival photos: on the check itself (v1.3.0), else the arrival_checked event, else the scenario fixture for a seeded finished deal. */
export function arrivalPhotosFrom(deal: Deal, timeline: DealEvent[], check: ArrivalCheck | null = null): Photo[] {
  if (check?.photos && check.photos.length > 0) return check.photos;
  const event = [...timeline].reverse().find((e) => e.kind === "arrival_checked" && Array.isArray(e.data?.photos));
  if (event) {
    const parsed = PhotoSchema.array().safeParse(event.data?.photos);
    if (parsed.success) return parsed.data;
  }
  return fixtureById(deal.scenario)?.arrivalPhotos ?? [];
}

/** Build and save the pack for a deal already in hand. Does not wait on services.ready, so seeding can use it. */
export async function buildEvidenceFor(services: EvidenceServices, deal: Deal, requestedBy: Role): Promise<EvidencePack> {
  const { store } = services;
  if (!deal.lockedCardVersion) throw new FlowError("The item card is not locked yet.", 409);
  const lockedCard = await store.getCard(deal.id, deal.lockedCardVersion);
  if (!lockedCard) throw notFound("Locked card");
  const [verdicts, arrivalCheck, messages, payment, shipment, timeline] = await Promise.all([
    store.listVerdicts(deal.id),
    store.getArrivalCheck(deal.id),
    store.listMessages(deal.id),
    store.getPayment(deal.id),
    store.getShipment(deal.id),
    store.listEvents(deal.id),
  ]);
  const arrivalPhotos = arrivalCheck ? arrivalPhotosFrom(deal, timeline, arrivalCheck) : [];
  const result = await services.buildEvidencePack({
    deal,
    lockedCard: absoluteCard(lockedCard),
    verdicts,
    arrivalCheck,
    messages: absoluteMessages(messages),
    payment,
    shipment: shipment ? { ...shipment, packingPhotos: absolutePhotos(shipment.packingPhotos) } : null,
    timeline,
    arrivalPhotos: absolutePhotos(arrivalPhotos),
    requestedBy,
  });
  // Tamper-evident history: the head recorded on the PayPal order, and whether the stored events still reproduce it.
  const historyHash = result.data.historyHash ?? payment?.historyHash ?? null;
  const historyVerified = result.data.historyVerified ?? (historyHash ? historyMatchesHead(timeline, historyHash) : null);
  // The pack keeps the photos as stored (relative) so its page works on any host; the builder saw absolute URLs.
  const toRelative = relativizer([...lockedCard.photos, ...(shipment?.packingPhotos ?? []), ...arrivalPhotos, ...messages.flatMap((m) => m.photos)]);
  const pack = await store.saveEvidence({
    ...result.data,
    lockedCard,
    messages,
    shipment,
    photos: result.data.photos.map(toRelative),
    historyHash,
    historyVerified,
  });
  await note(services, deal.id, "evidence_built", pack.builtBy, "Evidence pack built for a PayPal dispute.");
  await say(services, deal.id, requestedBy === "buyer" ? "buyer_pal" : "seller_pal", pack.builtBy, result.palMessage);
  return pack;
}

export async function buildEvidence(services: Services, dealId: string, requestedBy: Role): Promise<EvidencePack> {
  const deal = await mustDeal(services, dealId);
  return buildEvidenceFor(services, deal, requestedBy);
}
