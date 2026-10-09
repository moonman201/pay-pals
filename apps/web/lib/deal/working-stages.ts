/**
 * What to say while a pal is working. A Claude review takes tens of
 * seconds, so the wait names what the pal is doing now and moves on every
 * few seconds, ending on the last stage rather than looping.
 */
export const STAGE_MS = 8000;

/** The Buyer Pal's review. The cert stage only exists when the card carries a cert number. */
export function reviewStages(hasCert: boolean): string[] {
  return ["Reading the chat", "Checking the price", ...(hasCert ? ["Checking the cert"] : []), "Writing the verdict"];
}

/** The Buyer Pal's arrival check against the locked card. */
export const ARRIVAL_STAGES = ["Reading the arrival photos", "Comparing them to the locked card", "Writing what it found"];

/** Which stage is showing after this long. Stops on the last one. */
export function stageAt(stages: readonly string[], elapsedMs: number, stepMs = STAGE_MS): string {
  if (stages.length === 0) return "";
  const i = Math.floor(Math.max(0, elapsedMs) / stepMs);
  return stages[Math.min(i, stages.length - 1)]!;
}
