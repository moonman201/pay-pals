/**
 * What Pay Pals holds itself: the item card, the photos, the chat and the
 * pal checks. The other half of the payment panel, so a reader can tell our
 * record apart from PayPal's. Pure.
 */
import type { ArrivalCheck, ItemCard, Message, PaymentMethod, Shipment, Verdict } from "@pay-pals/contracts";

export interface RecordedLine {
  label: string;
  value: string;
}

export interface RecordedInput {
  cards: readonly ItemCard[];
  lockedVersion: number | null;
  messages: readonly Message[];
  verdicts: readonly Verdict[];
  arrivalCheck: ArrivalCheck | null;
  shipment: Shipment | null;
  /** Which button the buyer pressed. Null before any order. */
  method?: PaymentMethod | null;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function cardLine(input: RecordedInput): string {
  const locked = input.lockedVersion !== null ? input.cards.find((c) => c.version === input.lockedVersion) : undefined;
  if (locked) return `Version ${locked.version}, locked. ${plural(input.cards.length, "version", "versions")} kept.`;
  const current = input.cards[input.cards.length - 1];
  if (!current) return "No item card yet.";
  return `Version ${current.version}, still open to change. ${plural(input.cards.length, "version", "versions")} kept.`;
}

function photoLine(input: RecordedInput): string {
  const onCards = new Set<string>();
  for (const card of input.cards) for (const photo of card.photos) onCards.add(photo.url);
  const packing = input.shipment?.packingPhotos.length ?? 0;
  const arrival = input.arrivalCheck?.photos?.length ?? 0;
  const parts = [`${plural(onCards.size, "photo", "photos")} on the item card`];
  if (packing > 0) parts.push(`${packing} packing`);
  if (arrival > 0) parts.push(`${arrival} arrival`);
  return onCards.size === 0 && packing === 0 && arrival === 0 ? "None." : `${parts.join(", ")}.`;
}

function chatLine(input: RecordedInput): string {
  const shared = input.messages.filter((m) => m.channel === "deal").length;
  const pal = input.messages.length - shared;
  return `${plural(shared, "shared message", "shared messages")}, ${plural(pal, "pal message", "pal messages")}.`;
}

function checkLine(input: RecordedInput): string {
  const parts: string[] = [];
  if (input.verdicts.length > 0) parts.push(plural(input.verdicts.length, "Buyer Pal review", "Buyer Pal reviews"));
  if (input.verdicts.some((v) => v.certCheck)) parts.push("a cert number check");
  const shipmentFlags = input.shipment?.flags;
  if (shipmentFlags !== undefined) parts.push("a ship-time check");
  if (input.arrivalCheck) parts.push("an arrival check");
  return parts.length === 0 ? "None yet." : `${parts.join(", ")}.`;
}

/** The lines under "Recorded by Pay Pals". The first four are always there, so the panel keeps its shape. */
export function recordedByPayPals(input: RecordedInput): RecordedLine[] {
  const lines: RecordedLine[] = [
    { label: "Item card", value: cardLine(input) },
    { label: "Photos", value: photoLine(input) },
    { label: "Chat", value: chatLine(input) },
    { label: "Pal checks", value: checkLine(input) },
  ];
  if (input.method) {
    lines.push({ label: "Button the buyer pressed", value: `${input.method === "venmo" ? "Venmo" : "PayPal"}. Pay Pals only ever creates a Goods and Services checkout order.` });
  }
  return lines;
}
