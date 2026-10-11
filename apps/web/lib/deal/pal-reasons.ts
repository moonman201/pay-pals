/**
 * The pal's reasons, laid out: what it checked, what it found, what it could
 * not check, and what would change its mind (contracts v1.7.0, batch item
 * C5). Pure, and absent-tolerant: a verdict stored before the field existed
 * has no reasons and renders exactly as it did.
 *
 * `couldNotVerify` is the group the feature exists for, so it is the one
 * group that still prints when it is empty. A pal that checked everything it
 * set out to check says so; a pal that quietly dropped the group cannot hide
 * behind an empty list.
 */
import type { PalReasoning } from "@pay-pals/contracts";

export type ReasonGroupId = keyof PalReasoning;

export const REASON_GROUP_IDS: readonly ReasonGroupId[] = ["checked", "found", "couldNotVerify", "wouldChangeMyMind"];

export type ReasonTone = "plain" | "caution" | "ask";

export interface ReasonGroup {
  id: ReasonGroupId;
  title: string;
  /** One line saying what the group is for, under the title. */
  intro: string;
  tone: ReasonTone;
  items: string[];
  /** What to say when the pal listed nothing here. Only `couldNotVerify` prints in that case. */
  emptyText: string | null;
}

const META: Readonly<Record<ReasonGroupId, Pick<ReasonGroup, "title" | "intro" | "tone" | "emptyText">>> = {
  checked: {
    title: "What I checked",
    // No intro. The title already says it, and a sentence under every heading
    // was most of what made this block long (Matt's rule 1, Oct 11).
    intro: "",
    tone: "plain",
    emptyText: null,
  },
  found: {
    title: "What I found",
    intro: "What those checks came back with.",
    tone: "plain",
    emptyText: null,
  },
  couldNotVerify: {
    title: "What I could not check",
    // This one keeps its sentence. It is the disclaimer for the group, it sits
    // beside the thing it qualifies, and it is said in exactly one place.
    intro: "Open questions, not findings against the seller.",
    tone: "caution",
    emptyText: "Nothing. Everything I set out to check, I could check.",
  },
  wouldChangeMyMind: {
    title: "What would change my mind",
    intro: "Send any of these and I will look again.",
    tone: "ask",
    emptyText: null,
  },
};

export function hasReasons(reasoning: PalReasoning | null | undefined): reasoning is PalReasoning {
  return Boolean(reasoning);
}

/**
 * The same sentence twice, removed. Nothing cleverer.
 *
 * This list did repeat itself in substance: on the stolen-photo deal the pal
 * said in three different sentences that a matching cert does not show the
 * seller is holding the slab. Judging that two differently worded lines make
 * the same point is the pal's job, not this layer's, and builder-agents is
 * cutting those lines at source now that the cert panel says it next to the
 * table. A heuristic here guessing at meaning would be a second mechanism
 * competing with that one, and it could drop a line that genuinely said
 * something new.
 *
 * So this removes only what is literally the same line, ignoring case and
 * spacing, which can never hide a claim nobody else made.
 */
export function dedupeReasons(lines: readonly string[]): string[] {
  const seen = new Set<string>();
  return lines.filter((line) => {
    const key = line.trim().toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The groups to render, in the order given (or the canonical order). A group
 * with nothing in it is dropped unless it has something to say when empty.
 */
export function reasonGroups(reasoning: PalReasoning | null | undefined, only: readonly ReasonGroupId[] = REASON_GROUP_IDS): ReasonGroup[] {
  if (!hasReasons(reasoning)) return [];
  const groups: ReasonGroup[] = [];
  for (const id of only) {
    // Only this group repeats itself, and it is the group a reader has to take seriously.
    const items = id === "couldNotVerify" ? dedupeReasons(reasoning[id] ?? []) : [...(reasoning[id] ?? [])];
    const meta = META[id];
    if (items.length === 0 && meta.emptyText === null) continue;
    groups.push({ id, ...meta, items });
  }
  return groups;
}

/** True when there is anything at all to render for these groups. */
export function hasAnyReason(reasoning: PalReasoning | null | undefined, only: readonly ReasonGroupId[] = REASON_GROUP_IDS): boolean {
  return reasonGroups(reasoning, only).length > 0;
}

/** The sentences the pal could not establish. The status view lists each as its own Unverified line. */
export function couldNotVerify(reasoning: PalReasoning | null | undefined): string[] {
  return hasReasons(reasoning) ? [...reasoning.couldNotVerify] : [];
}
