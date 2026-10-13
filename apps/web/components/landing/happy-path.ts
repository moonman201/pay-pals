/**
 * The clean deal's story at a glance: each verdict it got, then how far the money and the item went.
 * Pure. The inputs come from the seeded clean deal when there is one (lib/demo/clean-path.ts) and from
 * the fixture when there is not, so the card is read off a deal and not typed beside one.
 */
import type { ArrivalOutcome, DealState, ScenarioFixture, VerdictOverall } from "@pay-pals/contracts";

export type PathTone = "go" | "caution" | "stop" | "done";
export interface PathStep {
  label: string;
  tone: PathTone;
}

export interface PathInput {
  /** Verdicts in the order they were given. */
  overalls: VerdictOverall[];
  state: DealState;
  arrival: ArrivalOutcome | null;
}

const VERDICT_STEP: Record<VerdictOverall, PathStep> = {
  caution: { label: "Caution", tone: "caution" },
  go: { label: "Looks good", tone: "go" },
  stop: { label: "Stop", tone: "stop" },
};

const PAID_ON: readonly DealState[] = ["PAID", "SHIPPED", "DELIVERED", "COMPLETE"];
const SHIPPED_ON: readonly DealState[] = ["SHIPPED", "DELIVERED", "COMPLETE"];

export function happyPath({ overalls, state, arrival }: PathInput): PathStep[] {
  const steps = overalls.map((o) => VERDICT_STEP[o]);
  if (PAID_ON.includes(state)) steps.push({ label: "Paid", tone: "done" });
  if (SHIPPED_ON.includes(state)) steps.push({ label: "Shipped", tone: "done" });
  if (arrival === "match") steps.push({ label: "Matched", tone: "done" });
  return steps;
}

/** "Buyer Pal reviewed card version 2: go." The fixture timeline's review lines end in the verdict. */
const REVIEW_LINE = /reviewed card version \d+: (go|caution|stop)\b/i;

/** The same inputs read off the fixture's own timeline, for when no seeded deal exists. */
export function inputFromFixture(fixture: ScenarioFixture): PathInput {
  const overalls: VerdictOverall[] = [];
  for (const event of fixture.timeline) {
    if (event.kind !== "review_posted") continue;
    const m = REVIEW_LINE.exec(event.summary);
    if (m) overalls.push(m[1]!.toLowerCase() as VerdictOverall);
  }
  return { overalls, state: fixture.deal.state, arrival: fixture.expectedArrival?.outcome ?? null };
}
