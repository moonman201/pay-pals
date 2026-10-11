/**
 * A short name for the header, because the full one belongs on the item
 * card and printing it twice makes the first line of the page the longest
 * (Matt's rule 1).
 *
 * This reads the card's own fields. It does not parse the title, because a
 * title is prose and a wrong guess puts a misleading name at the top of
 * the page, which is worse than a long one: the reader cannot tell what
 * was dropped.
 *
 * It fires for graded cards only, which is where the problem is. A graded
 * card's title is a catalogue entry, and its `model` already holds the
 * catalogue in parts:
 *
 *   "Sun & Moon Tag Bolt, Gengar & Mimikyu GX, 038/095"
 *    set                  subject              number
 *
 * The subject is the last part that is not just a number, and the grade is
 * the other half of what tells two slabs apart. Everything else, including
 * every console, watch and phone, keeps the title it was given.
 */
import type { ItemCard } from "@pay-pals/contracts";

/** "038/095", "12", "4 / 10". A part made only of digits and separators names no item. */
const JUST_A_NUMBER = /^[\d\s/.-]+$/;

export function shortTitle(card: Pick<ItemCard, "title" | "model" | "grade" | "certNumber"> | null | undefined): string {
  const full = (card?.title ?? "").trim();
  if (full === "") return "New deal";
  // No cert number means no catalogue shape to rely on, so nothing is assumed.
  if (!card?.certNumber) return full;

  const parts = (card.model ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p !== "" && !JUST_A_NUMBER.test(p));
  const subject = parts[parts.length - 1];
  const grade = card.grade?.trim();
  if (!subject || parts.length < 2) return full;

  const short = [subject, grade].filter(Boolean).join(", ");
  // A "shorter" title that is not shorter is just a different title, which helps nobody.
  return short.length < full.length ? short : full;
}
