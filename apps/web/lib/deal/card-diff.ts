/** Plain sentences describing what changed between two card versions. */
import { CONDITION_LABELS, type ItemCard } from "@pay-pals/contracts";

export function diffCards(prev: ItemCard, next: ItemCard): string[] {
  const out: string[] = [];
  if (prev.title !== next.title) out.push(`Title changed to "${next.title}".`);
  if (prev.askingPrice !== next.askingPrice) out.push(`Price changed from $${prev.askingPrice} to $${next.askingPrice}.`);
  if (prev.serial !== next.serial) out.push(next.serial ? `Serial added: ${next.serial}.` : "Serial removed.");
  if (prev.conditionGrade !== next.conditionGrade) out.push(`Condition changed to ${CONDITION_LABELS[next.conditionGrade]}.`);
  if (prev.conditionNotes !== next.conditionNotes) out.push("Condition notes updated.");
  const added = next.photos.filter((p) => !prev.photos.some((q) => q.url === p.url));
  if (added.length > 0) out.push(`${added.length} ${added.length === 1 ? "photo" : "photos"} added: ${added.map((p) => p.whatItShows).join("; ")}`);
  const removed = prev.photos.filter((p) => !next.photos.some((q) => q.url === p.url));
  if (removed.length > 0) out.push(`${removed.length} ${removed.length === 1 ? "photo" : "photos"} removed.`);
  if (prev.included.join("|") !== next.included.join("|")) out.push(`Included now: ${next.included.join(", ")}.`);
  return out;
}
