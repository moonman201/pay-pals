/**
 * Assembles the evidence pack from everything apps/web gathered for a deal:
 * the locked card, every verdict, the arrival check, the chat, the payment,
 * the shipment, the timeline and all photos, with a plain summary on top.
 */
import type { EvidenceInput, EvidencePack, EvidencePackBuilder, PalResult, Photo } from "@pay-pals/contracts";
import type { ClaudeClient } from "../claude/client";
import { createAnthropicClientFromEnv } from "../claude/client";
import { sentences } from "../copy";
import { historyStatus, messageCounts, writeSummary } from "./summary";

export interface EvidencePackOptions {
  anthropic: ClaudeClient | null;
}

/** Every photo attached to the deal, in the order it appeared, without duplicates: card, chat, packing, arrival. */
export function collectPhotos(input: EvidenceInput): Photo[] {
  const seen = new Set<string>();
  const photos: Photo[] = [];
  const add = (photo: Photo) => {
    if (seen.has(photo.url)) return;
    seen.add(photo.url);
    photos.push(photo);
  };
  for (const photo of input.lockedCard.photos) add(photo);
  for (const message of input.messages) for (const photo of message.photos) add(photo);
  for (const photo of input.shipment?.packingPhotos ?? []) add(photo);
  for (const photo of input.arrivalPhotos ?? []) add(photo);
  return photos;
}

export async function buildEvidencePack(input: EvidenceInput, options?: EvidencePackOptions): Promise<PalResult<EvidencePack>> {
  const client = options ? options.anthropic : createAnthropicClientFromEnv();
  const photos = collectPhotos(input);
  const summary = await writeSummary(input, client);
  const history = historyStatus(input);
  const pack: EvidencePack = {
    ...(history ?? {}),
    dealId: input.deal.id,
    builtBy: input.requestedBy === "buyer" ? "buyer_pal" : "seller_pal",
    builtAt: new Date().toISOString(),
    lockedCard: input.lockedCard,
    verdicts: input.verdicts,
    arrivalCheck: input.arrivalCheck,
    messages: input.messages,
    photos,
    payment: input.payment,
    shipment: input.shipment,
    timeline: input.timeline,
    summary,
  };
  const counts = messageCounts(input.messages);
  const palMessage = sentences(
    `Evidence pack ready: locked card version ${input.lockedCard.version}, ${photos.length} photo${photos.length === 1 ? "" : "s"}, ${counts.shared} shared chat message${counts.shared === 1 ? "" : "s"}${counts.pal > 0 ? ` and ${counts.pal} pal message${counts.pal === 1 ? "" : "s"}` : ""},`,
    input.payment ? `PayPal order ${input.payment.paypalOrderId},` : "no PayPal order,",
    input.shipment ? `${input.shipment.carrier} tracking ${input.shipment.trackingNumber},` : "no shipment,",
    input.arrivalCheck ? `and the arrival check (${input.arrivalCheck.matches ? "matched" : "did not match"}).` : "and the full timeline.",
    history ? (history.historyVerified ? "The history hash on the PayPal order matches the stored events." : "The stored events do not reproduce the history hash on the PayPal order.") : null,
    input.arrivalCheck && !input.arrivalCheck.matches ? "Open a dispute in PayPal for this order and attach this pack." : "Keep this in case either side needs it.",
  );
  return { data: pack, palMessage };
}

export function createEvidencePackBuilder(options: EvidencePackOptions): EvidencePackBuilder {
  return (input) => buildEvidencePack(input, options);
}
