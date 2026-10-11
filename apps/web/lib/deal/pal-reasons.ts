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
 * Themes the pal tends to state more than once in one list, each matched by
 * what the sentence is about rather than by its words.
 *
 * On the stolen-photo deal the pal said, in three separate lines, that a
 * matching cert does not show the seller is holding the slab. All three were
 * true and all three were the same point, and a list that repeats itself
 * reads as padding, which is the one thing this list cannot afford.
 *
 * This is a display fix and it is deliberately timid: it keeps the longest
 * line in a theme, which is the most specific one, drops the shorter
 * restatements, and leaves every line matching no theme exactly where it is.
 * No sentence is ever reworded. The better fix is the pal not saying it three
 * times, which is builder-agents' call, not this layer's.
 */
const THEMES: readonly RegExp[] = [
  /holding the (item|slab|console)|who is holding|actually holding|seller owns|owns the/i,
  /no market price|price came back|compare the \$?[\d,.]+ ask/i,
  /demo record|standing in for the grader/i,
];

/** One line per theme, the most specific one, plus everything that fits no theme. */
export function dedupeReasons(lines: readonly string[]): string[] {
  const best = new Map<number, string>();
  const kept: (string | number)[] = [];
  for (const line of lines) {
    const theme = THEMES.findIndex((re) => re.test(line));
    if (theme === -1) {
      kept.push(line);
      continue;
    }
    const held = best.get(theme);
    if (held === undefined) kept.push(theme);
    if (held === undefined || line.length > held.length) best.set(theme, line);
  }
  return kept.map((k) => (typeof k === "string" ? k : best.get(k)!));
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
