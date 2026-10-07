/**
 * Small builders for tests: a plain card and seller or buyer chat lines.
 * Start from the clean fixture so every field is contract-valid.
 */
import type { ItemCard, Message } from "@pay-pals/contracts";
import { cleanPs5 } from "@pay-pals/contracts";

export function card(overrides: Partial<ItemCard> = {}): ItemCard {
  return { ...cleanPs5.cards[0]!, lockedAt: null, ...overrides };
}

let counter = 0;

export function says(author: "seller" | "buyer", text: string, channel: Message["channel"] = "deal"): Message {
  counter += 1;
  return {
    id: `t${counter}`,
    dealId: cleanPs5.deal.id,
    channel,
    author,
    text,
    photos: [],
    at: new Date(Date.parse("2026-10-21T16:00:00.000Z") + counter * 60_000).toISOString(),
  };
}
