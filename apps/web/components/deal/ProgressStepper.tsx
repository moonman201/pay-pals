import type { DealEvent, DealState } from "@pay-pals/contracts";
import { dealProgress, type ProgressEnd } from "@/lib/deal/progress";
import { CheckIcon, IssueIcon, ShieldStopIcon } from "../ui/icons";

const END_STYLE: Record<NonNullable<ProgressEnd>["kind"], string> = {
  blocked: "border-stop-line bg-stop-soft text-stop",
  issue: "border-caution-line bg-caution-soft text-caution",
  cancelled: "border-line bg-wash text-muted",
  off_platform: "border-caution-line bg-caution-soft text-caution",
};

function EndIcon({ kind }: { kind: NonNullable<ProgressEnd>["kind"] }) {
  if (kind === "blocked") return <ShieldStopIcon size={16} />;
  if (kind === "issue" || kind === "off_platform") return <IssueIcon size={16} />;
  return null;
}

/**
 * Where the deal stands, as up to seven steps. Done steps fill with the side's
 * colour, the current one lights up once, and a deal that ended early
 * carries its end badge right after the last step it reached.
 *
 * A deal that ended early lists only the steps it reached and one line for
 * the rest, since they will never happen.
 *
 * Every step is on the page at every width: the row wraps onto two or three
 * lines on a phone, where the joining lines between steps are dropped, and
 * sits on one line with them from 640 px up. Nothing scrolls sideways and
 * nothing is clipped.
 */
export function ProgressStepper({ state, events, className = "" }: { state: DealState; events: readonly DealEvent[]; className?: string }) {
  const progress = dealProgress(state, events);
  const lastDone = progress.steps.reduce((acc, s, i) => (s.status === "done" ? i : acc), -1);
  return (
    <nav aria-label="Deal progress" className={className} data-testid="progress-stepper">
      <ol className="flex flex-wrap items-center gap-y-1">
        {progress.steps.map((step, i) => {
          const done = step.status === "done";
          const current = step.status === "current";
          return (
            <li key={step.id} className="flex items-center" aria-current={current ? "step" : undefined} data-status={step.status}>
              {i > 0 ? <span aria-hidden className={`hidden h-0.5 w-5 sm:inline-block sm:w-6 lg:w-8 ${done || current ? "bg-[var(--accent)]" : "bg-line"}`} /> : null}
              <span className={`mr-1 flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2 sm:mr-0 sm:bg-transparent ${current ? "bg-[var(--accent-soft)]" : done ? "bg-wash" : ""}`}>
                <span
                  aria-hidden
                  className={`motion-step flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold ${
                    done
                      ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
                      : current
                        ? "border-[var(--accent)] bg-surface text-[var(--accent-ink)] shadow-[0_0_0_4px_var(--accent-soft)]"
                        : "border-line bg-surface text-muted"
                  }`}
                >
                  {done ? <CheckIcon size={14} strokeWidth={3} /> : i + 1}
                </span>
                <span className={`text-xs ${current ? "font-bold text-[var(--accent-ink)]" : done ? "font-semibold text-ink" : "text-muted"}`}>{step.label}</span>
              </span>
              {progress.end && i === Math.max(lastDone, 0) ? (
                <>
                  <span aria-hidden className="hidden h-0.5 w-5 bg-line sm:inline-block sm:w-6 lg:w-8" />
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${END_STYLE[progress.end.kind]}`} data-testid="progress-end">
                    <EndIcon kind={progress.end.kind} />
                    {progress.end.label}
                  </span>
                </>
              ) : null}
            </li>
          );
        })}
      </ol>
      {progress.notReached.length > 0 ? (
        <p className="mt-1.5 text-xs text-muted" data-testid="progress-not-reached">
          Not reached: {progress.notReached.slice(0, -1).join(", ")}
          {progress.notReached.length > 1 ? " and " : ""}
          {progress.notReached[progress.notReached.length - 1]}.
        </p>
      ) : null}
    </nav>
  );
}
