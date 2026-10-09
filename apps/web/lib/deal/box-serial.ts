/** Whether the serial on the box label is the serial on the item. One rule for the card view and the evidence pack. */
import type { ItemCard } from "@pay-pals/contracts";

export type BoxSerialStatus = "match" | "mismatch" | "unread";

function norm(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, "").toUpperCase();
}

/**
 * A card can carry a box label before anyone has read the serial off the
 * item itself, which is where the clean deal starts. That is not a
 * mismatch: there is nothing to compare yet, and saying "does not match"
 * would accuse an honest seller.
 */
export function boxSerialStatus(card: Pick<ItemCard, "serial" | "boxSerial">): BoxSerialStatus {
  if (norm(card.boxSerial) === "") return "unread";
  if (norm(card.serial) === "") return "unread";
  return norm(card.boxSerial) === norm(card.serial) ? "match" : "mismatch";
}

export function boxSerialMatches(card: Pick<ItemCard, "serial" | "boxSerial">): boolean {
  return boxSerialStatus(card) === "match";
}

export function boxSerialLabel(card: Pick<ItemCard, "serial" | "boxSerial">): string {
  switch (boxSerialStatus(card)) {
    case "match":
      return "matches the console";
    case "mismatch":
      return "does not match";
    case "unread":
      return "no serial read off the console yet";
  }
}
