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
    intro: "The things I looked at, and what I compared them with.",
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
    intro: "I looked and could not establish these. They are open questions, not findings against the seller.",
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
 * The groups to render, in the order given (or the canonical order). A group
 * with nothing in it is dropped unless it has something to say when empty.
 */
export function reasonGroups(reasoning: PalReasoning | null | undefined, only: readonly ReasonGroupId[] = REASON_GROUP_IDS): ReasonGroup[] {
  if (!hasReasons(reasoning)) return [];
  const groups: ReasonGroup[] = [];
  for (const id of only) {
    const items = reasoning[id] ?? [];
    const meta = META[id];
    if (items.length === 0 && meta.emptyText === null) continue;
    groups.push({ id, ...meta, items: [...items] });
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
