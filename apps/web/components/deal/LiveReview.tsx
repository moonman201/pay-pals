"use client";

import { isPaymentMethodFlag, type RedFlag } from "@pay-pals/contracts";
import { agreeLockedLine, hasStopFlag, liveReviewLine, nothingYet, orderedFlags, type LiveReviewState } from "@/lib/deal/live-review";
import { flagLabel } from "@/lib/deal/override";
import { hasUsableRange, priceRangeLine, priceSourceNote } from "@/lib/deal/price-copy";
import { PalAvatar } from "../pal/PalAvatar";
import { Badge, type Tone } from "../ui/Badge";
import { Panel } from "../ui/Panel";
import { WorkingStatus } from "../ui/WorkingStatus";
import { FlagEvidence } from "./FlagEvidence";

const FLAG_TONE: Record<RedFlag["severity"], Tone> = { info: "neutral", caution: "caution", stop: "stop" };

const NO_CERT = "No cert number on the card, so there was nothing to check.";

/** A card with no cert has nothing to wait for, so it never says "Still running". */
function certLine(state: LiveReviewState, hasCert: boolean): string {
  if (!hasCert || (state.certChecked && !state.certCheck)) return NO_CERT;
  if (!state.certChecked) return "Still running.";
  if (state.certCheck?.matches === true) return "The grader's record agrees with the card.";
  if (state.certCheck?.matches === false) return "The grader's record does not agree with the card.";
  return "Could not be compared.";
}

/**
 * The review while it is still running: findings appear the moment they land
 * (Decision 19), and the panel never reads as a finished result (Decision 20).
 *
 * The flags are sorted loudest first rather than left in arrival order. The
 * lookups run concurrently, so arrival order is different every run, and a
 * page that reshuffles itself as answers come back is hard to read and
 * impossible to screenshot. A stop still shows the moment it lands; it just
 * lands at the top.
 */
export function LiveReview({ state, photoTotal = 0, hasCert = true }: { state: LiveReviewState; photoTotal?: number; hasCert?: boolean }) {
  const flags = orderedFlags(state.flags);
  const stop = hasStopFlag(state);
  return (
    <Panel
      title="Buyer Pal review, in progress"
      id="live-review"
      labelAs="region"
      aside={
        <Badge tone={stop ? "stop" : "neutral"} data-testid="live-review-badge">
          {stop ? "stop found, still checking" : "still checking"}
        </Badge>
      }
    >
      <div data-testid="review-running" data-stop={stop ? "true" : "false"}>
        <div className="flex gap-3">
          <PalAvatar pal="buyer" size={36} className="shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-relaxed text-ink" data-testid="live-review-line">
              {liveReviewLine(state)}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted" data-testid="agree-locked-line">
              {agreeLockedLine(state)}
            </p>
          </div>
        </div>

        {state.stage ? <WorkingStatus stages={[state.stage]} /> : <WorkingStatus stages={["Starting the checks"]} />}

        {flags.length > 0 ? (
          <ul className="mt-4 space-y-2" aria-label="Findings so far" data-testid="live-flags">
            {flags.map((f) => (
              <li key={f.code} className="motion-reveal flex gap-3 rounded-lg border border-line p-3 text-sm" data-testid="live-flag" data-code={f.code}>
                <PalAvatar pal="buyer" size={28} className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={FLAG_TONE[f.severity]}>{f.severity}</Badge>
                    <span className="rounded-md border border-line bg-wash px-2 py-0.5 font-semibold">{flagLabel(f.code)}</span>
                    {isPaymentMethodFlag(f) ? <Badge tone="stop">no override</Badge> : null}
                  </div>
                  <p className="mt-1">{f.explanation}</p>
                  <FlagEvidence evidence={f.evidence} />
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2" data-testid="live-lookups">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Price check</dt>
            <dd data-testid="live-price">
              {state.priceChecked
                ? `${priceRangeLine(state.priceCheck)}${hasUsableRange(state.priceCheck) ? `, ${priceSourceNote(state.priceCheck)}` : ""}`
                : "Still running."}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Cert check</dt>
            <dd data-testid="live-cert">
              {certLine(state, hasCert)}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Photos</dt>
            <dd data-testid="live-photos">
              {state.photoReads.length === 0
                ? "Still running."
                : `${state.photoReads.filter((p) => p.readable).length} of ${Math.max(photoTotal, state.photoReads.length)} read so far.`}
            </dd>
          </div>
        </dl>

        {nothingYet(state) ? null : <p className="mt-3 text-xs text-muted">More checks are still running. This is not the verdict.</p>}
      </div>
    </Panel>
  );
}
