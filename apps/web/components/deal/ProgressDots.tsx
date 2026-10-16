import type { DealEvent, DealState } from "@pay-pals/contracts";
import { dealProgress, progressStatusText, PROGRESS_STEPS, SEGMENT_LABELS } from "@/lib/deal/progress";

/**
 * Seven labelled segments and the status in words next to them: "Stopped at Reviewed", "Paid",
 * "Issue at Arrived". Colour is never the only carrier. Every segment is named (Invited, Card,
 * Reviewed, Agreed, Paid, Shipped, Arrived) in its tooltip and for a screen reader, with whether it is
 * done, current or not reached, and a done segment is solid while an unreached one is hollow, so the
 * bar reads in greyscale too. The one line of visible text is what keeps the first screen short; the
 * full stepper, with every step spelled out, is in the Deal status section.
 */
export function ProgressDots({ state, events }: { state: DealState; events: readonly DealEvent[] }) {
  const progress = dealProgress(state, events);
  const status = progressStatusText(progress);
  const tone = progress.end?.kind === "blocked" ? "bg-stop" : progress.end?.kind === "off_platform" ? "bg-caution" : "bg-[var(--accent)]";
  return (
    <div className="flex items-center gap-3" data-testid="progress-dots" role="group" aria-label={`Deal progress: ${status}`}>
      <ol className="m-0 flex min-w-0 flex-1 list-none items-center gap-1.5 p-0">
        {PROGRESS_STEPS.map((id) => {
          const step = progress.steps.find((s) => s.id === id);
          const stepStatus = step?.status ?? "upcoming";
          const word = stepStatus === "done" ? "done" : stepStatus === "current" ? "current" : "not reached";
          return (
            <li
              key={id}
              title={`${SEGMENT_LABELS[id]}, ${word}`}
              data-status={stepStatus}
              aria-current={stepStatus === "current" ? "step" : undefined}
              className={`h-2.5 flex-1 rounded-full ${stepStatus === "done" ? tone : stepStatus === "current" ? "border-2 border-[var(--accent)] bg-[var(--accent-soft)]" : "border border-dashed border-muted bg-transparent"}`}
            >
              <span className="sr-only">
                {SEGMENT_LABELS[id]}, {word}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="shrink-0 text-xs font-bold text-ink" data-testid="progress-status">
        {status}
      </p>
    </div>
  );
}
