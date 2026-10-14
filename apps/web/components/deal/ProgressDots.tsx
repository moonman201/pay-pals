import type { DealEvent, DealState } from "@pay-pals/contracts";
import { dealProgress, PROGRESS_LABELS, PROGRESS_STEPS } from "@/lib/deal/progress";

/**
 * Seven dots for where the deal stands, with no words on screen: the full stepper, with every step
 * named and the steps a deal will never reach, is in the Deal status section. A screen reader gets one
 * sentence ("Step 3 of 7, Reviewed. Blocked.") and a sighted reader gets the same through the title.
 */
export function ProgressDots({ state, events }: { state: DealState; events: readonly DealEvent[] }) {
  const progress = dealProgress(state, events);
  const doneCount = progress.steps.filter((s) => s.status === "done").length;
  const current = progress.steps.find((s) => s.status === "current");
  const reached = doneCount === 0 ? "Not started" : `${PROGRESS_LABELS[progress.steps[Math.max(doneCount - 1, 0)]!.id]} done`;
  const sentence = `${current ? `Step ${doneCount + 1} of ${PROGRESS_STEPS.length}, ${current.label}` : `${doneCount} of ${PROGRESS_STEPS.length} steps, ${reached}`}${progress.end ? `. ${progress.end.label}.` : "."}`;
  const tone = progress.end?.kind === "blocked" ? "bg-stop" : progress.end ? "bg-caution" : "bg-[var(--accent)]";
  return (
    <div role="img" aria-label={sentence} title={sentence} data-testid="progress-dots" className="flex items-center gap-1.5">
      {PROGRESS_STEPS.map((id, i) => {
        const done = i < doneCount;
        const isCurrent = current?.id === id;
        return (
          <span
            key={id}
            aria-hidden
            className={`h-2 flex-1 rounded-full ${done ? tone : isCurrent ? "bg-[var(--accent-soft)] ring-2 ring-[var(--accent)]" : "bg-line"}`}
          />
        );
      })}
    </div>
  );
}
