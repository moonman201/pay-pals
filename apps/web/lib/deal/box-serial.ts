/** Whether the serial on the box label is the serial on the item. One rule for the card view and the evidence pack. */
import type { ItemCard } from "@pay-pals/contracts";

function norm(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, "").toUpperCase();
}

export function boxSerialMatches(card: Pick<ItemCard, "serial" | "boxSerial">): boolean {
  return norm(card.boxSerial) !== "" && norm(card.boxSerial) === norm(card.serial);
}

export function boxSerialLabel(card: Pick<ItemCard, "serial" | "boxSerial">): "matches the console" | "does not match" {
  return boxSerialMatches(card) ? "matches the console" : "does not match";
}
