/** Small helpers every flow uses: load a deal or fail, post a pal message, stamp events. */
import type { Deal, DealEvent, ItemCard, Message, Photo } from "@pay-pals/contracts";
import { nowIso } from "../../time";
import type { Services } from "../../services";
import { FlowError, notFound } from "../errors";

export async function mustDeal(services: Services, dealId: string): Promise<Deal> {
  await services.ready;
  const deal = await services.store.getDeal(dealId);
  if (!deal) throw notFound("Deal");
  return deal;
}

export async function mustCurrentCard(services: Services, dealId: string): Promise<ItemCard> {
  const card = await services.store.getCurrentCard(dealId);
  if (!card) throw new FlowError("This deal has no item card yet.", 409);
  return card;
}

export async function mustLockedCard(services: Services, deal: Deal): Promise<ItemCard> {
  if (!deal.lockedCardVersion) throw new FlowError("The item card is not locked yet.", 409);
  const card = await services.store.getCard(deal.id, deal.lockedCardVersion);
  if (!card) throw notFound("Locked card");
  return card;
}

export function expectState(deal: Deal, ...states: Deal["state"][]): void {
  if (!states.includes(deal.state)) {
    throw new FlowError(`This move is not available while the deal is ${deal.state}.`, 409);
  }
}

export async function say(
  services: Services,
  dealId: string,
  channel: Message["channel"],
  author: Message["author"],
  text: string,
  photos: Photo[] = [],
): Promise<Message> {
  return services.store.addMessage({ dealId, channel, author, text, photos, at: nowIso() });
}

export async function note(
  services: Services,
  dealId: string,
  kind: DealEvent["kind"],
  actor: DealEvent["actor"],
  summary: string,
  data?: Record<string, unknown>,
): Promise<DealEvent> {
  return services.store.appendEvent({ dealId, kind, actor, summary, data, at: nowIso() });
}
