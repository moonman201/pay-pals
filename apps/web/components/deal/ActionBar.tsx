"use client";

import { isTerminal, type DealState, type Verdict } from "@pay-pals/contracts";
import Link from "next/link";
import { useState } from "react";
import { agreeLabel, allowedActions, hasAgreed, isWaitingOnOther, type ActionId, type Agreement } from "@/lib/deal/actions";
import { BLOCKED_SENTENCE, CAUTION_CHECKBOX, gateFor, STOP_CHECKBOX, stopWarning } from "@/lib/deal/override";
import { reviewStages } from "@/lib/deal/working-stages";
import { otherRole, type Role } from "@/lib/role";
import { Button, type ButtonVariant } from "../ui/Button";
import { WorkingStatus } from "../ui/WorkingStatus";
import { Panel } from "../ui/Panel";
import { buttonClass } from "../ui/Button";

/** The panel the moves sit in, or just the moves when the verdict card already holds them. The heading stays for a screen reader. */
function Shell({ inline, children }: { inline: boolean; children: React.ReactNode }) {
  if (!inline) return <Panel title="Next step" accent>{children}</Panel>;
  return (
    <div role="group" aria-labelledby="next-step-title" data-testid="next-step">
      <h2 id="next-step-title" className="sr-only">
        Next step
      </h2>
      {children}
    </div>
  );
}

/** What a closed deal means. A line of text in a panel, one tap behind a label in the verdict card. */
function EndingNote({ inline, children }: { inline: boolean; children: React.ReactNode }) {
  if (!inline) return <p className="text-sm">{children}</p>;
  return (
    <details className="group mt-1" data-testid="ending-note">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-semibold text-[var(--accent-ink)] [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">
          &rsaquo;
        </span>
        Details
      </summary>
      <p className="text-sm leading-relaxed">{children}</p>
    </details>
  );
}

interface Props {
  state: DealState;
  role: Role;
  verdict: Verdict | null;
  dealId: string;
  busy: string | null;
  hasLockedCard: boolean;
  /** A pack has been built. A deal that finished with no issue has none, so no link is offered. */
  hasEvidence?: boolean;
  /** A seeded example deal. A visitor cannot cancel it, so no Cancel button. */
  example?: boolean;
  agreement: Agreement;
  cardVersion: number;
  /** This side agreed to an earlier version and the card changed since. */
  cardChangedSinceAgree: boolean;
  /** In INVITED: there is a refusal or a pasted reply for the Buyer Pal to review. */
  refusalToReview?: boolean;
  /** The card carries a cert number, so the pal has a cert to check while the buyer waits. */
  hasCert?: boolean;
  /**
   * A review is running for this deal (Decision 19). Agree is unavailable
   * until it finishes, and the line below the buttons says why. The server
   * refuses it too; this is the courtesy half.
   */
  reviewing?: boolean;
  /** Why Agree is locked, in plain words. Shown whenever `reviewing`. */
  reviewingLine?: string;
  onAction: (id: ActionId, opts?: { override?: boolean }) => void;
  /** Sits inside the verdict card instead of in a panel of its own. The words stay, the card around them goes. */
  inline?: boolean;
}

const VARIANT: Partial<Record<ActionId, ButtonVariant>> = { cancel: "danger", report_issue: "danger", complete: "primary" };

/** What to say under the buttons while a quick move runs. The review has staged lines of its own. */
const WORKING_NOTES: Partial<Record<ActionId, string>> = {
  agree: "Recording your agreement.",
  report_issue: "Opening the issue and building the evidence pack.",
};

const ENDINGS: Partial<Record<DealState, string>> = {
  COMPLETE: "This deal is complete. Both sides have the locked card, the payment record and the photos.",
  BLOCKED: BLOCKED_SENTENCE + " No order was created and no money moved.",
  ISSUE: "An issue is open. The evidence pack is built. It is useful context for a PayPal dispute, which PayPal decides under its own terms.",
  CANCELLED: "This deal was cancelled before any money moved.",
};

function EvidenceLink({ dealId, role, inline }: { dealId: string; role: Role; inline: boolean }) {
  return (
    <Link href={`/deals/${dealId}/evidence?as=${role}`} className={inline ? buttonClass("primary", "mt-1") : "mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline"}>
      Open the evidence pack
    </Link>
  );
}

/** The moves this side can make right now, straight from the transition table. */
export function ActionBar({ state, role, verdict, dealId, busy, hasLockedCard, hasEvidence = false, example = false, agreement, cardVersion, cardChangedSinceAgree, refusalToReview = false, hasCert = false, reviewing = false, reviewingLine = "", onAction, inline = false }: Props) {
  const [understood, setUnderstood] = useState(false);
  const other = otherRole(role);
  const agreeing = state === "REVIEWED" && cardVersion > 0;
  const mineDone = agreeing && hasAgreed(agreement, role);
  // The buyer's override rules apply only to the buyer's agree.
  const gate = agreeing && role === "buyer" ? gateFor(verdict) : "open";
  const needsCheckbox = gate === "override" || gate === "stop_override";
  const actions = allowedActions(state, role).filter((a) => {
    // Decision 19: never agree on partial findings. The agree route refuses it as well.
    if (a.id === "agree" && reviewing) return false;
    if (a.id === "agree") return cardVersion > 0 && !mineDone && gate !== "blocked";
    // In INVITED the Buyer Pal has nothing to review until the seller refuses or the buyer pastes a reply.
    if (a.id === "review" && state === "INVITED") return refusalToReview;
    return true;
  });
  const waiting = isWaitingOnOther(state, role) || (actions.every((a) => a.id === "cancel") && (mineDone || state === "INVITED" || (state === "REVIEWED" && cardVersion === 0)));

  if (state === "BLOCKED") {
    // The deal cannot go on, and the one move that closes it is the buyer's. Only the buyer sees it, and never on an example deal.
    const canCancel = role === "buyer" && !example && actions.some((a) => a.id === "cancel");
    return (
      <Shell inline={inline}>
        {inline ? null : <p className="text-sm">{ENDINGS.BLOCKED}</p>}
        {canCancel ? (
          <div className="mt-3">
            <Button variant="primary" disabled={busy !== null} onClick={() => onAction("cancel")}>
              {busy === "cancel" ? "Working" : "Cancel deal"}
            </Button>
          </div>
        ) : null}
        {hasLockedCard && hasEvidence ? <EvidenceLink dealId={dealId} role={role} inline={inline} /> : null}
        {inline ? <EndingNote inline>{ENDINGS.BLOCKED}</EndingNote> : null}
      </Shell>
    );
  }

  if (isTerminal(state)) {
    return (
      <Shell inline={inline}>
        {inline ? null : <EndingNote inline={false}>{ENDINGS[state]}</EndingNote>}
        {hasLockedCard && hasEvidence ? <EvidenceLink dealId={dealId} role={role} inline={inline} /> : null}
        {inline ? <EndingNote inline>{ENDINGS[state]}</EndingNote> : null}
      </Shell>
    );
  }

  return (
    <Shell inline={inline}>
      {gate === "blocked" ? <p className="mb-3 text-sm font-semibold text-stop">{BLOCKED_SENTENCE}</p> : null}
      {gate === "stop_override" && verdict ? (
        <div role="alert" className="mb-3 rounded-lg border border-stop-line bg-stop-soft p-3 text-sm text-ink">
          {stopWarning(verdict).map((line) => (
            <p key={line} className="mb-1 last:mb-0">
              {line}
            </p>
          ))}
        </div>
      ) : null}
      {reviewing && reviewingLine ? (
        <p className="mb-3 rounded-lg border border-[var(--accent-line)] bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--accent-ink)]" data-testid="agree-locked">
          {reviewingLine}
        </p>
      ) : null}
      {state === "INVITED" && refusalToReview && role === "buyer" ? (
        <p className="mb-3 text-sm">The seller has not joined. Ask your pal to review what they said before you do anything else.</p>
      ) : null}
      {agreeing && cardChangedSinceAgree && !mineDone ? (
        <p className="mb-3 text-sm font-semibold text-ink">Card changed since you agreed. Read version {cardVersion} and agree again.</p>
      ) : null}
      {agreeing && !mineDone && hasAgreed(agreement, other) ? <p className="mb-3 text-sm text-muted">The {other} has agreed to version {cardVersion}.</p> : null}
      {needsCheckbox && !mineDone ? (
        <label className="mb-3 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5" />
          <span>{gate === "stop_override" ? STOP_CHECKBOX : CAUTION_CHECKBOX}</span>
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => {
          // A review already running (started here, before a reload, or on another tab) is never started twice.
          const disabled = busy !== null || (a.id === "review" && reviewing) || (a.id === "agree" && needsCheckbox && !understood);
          const variant: ButtonVariant = VARIANT[a.id] ?? (a.id === "cancel" ? "danger" : actions.length > 1 && a.id !== actions[0]?.id ? "secondary" : "primary");
          const label = a.id === "agree" ? agreeLabel(role, agreement) : a.id === "review" && state === "INVITED" ? "Ask my pal to review the refusal" : a.label;
          return (
            <Button key={a.id} variant={variant} disabled={disabled} onClick={() => onAction(a.id, { override: a.id === "agree" && needsCheckbox })}>
              {busy === a.id ? "Working" : a.id === "review" && reviewing ? "Review running" : label}
            </Button>
          );
        })}
      </div>
      {busy === "review" ? <WorkingStatus stages={reviewStages(hasCert)} /> : null}
      {busy && WORKING_NOTES[busy as ActionId] ? (
        <p role="status" aria-live="polite" className="mt-3 text-sm text-[var(--accent-ink)]">
          {WORKING_NOTES[busy as ActionId]}
        </p>
      ) : null}
      {mineDone ? <p className="mt-3 text-sm text-muted">You agreed to version {cardVersion}, waiting for the other side.</p> : null}
      {waiting ? (
        <p className="mt-3 text-sm text-muted">
          {state === "INVITED" || (state === "REVIEWED" && cardVersion === 0) ? (
            <>Waiting for the seller to join and add photos. In demo mode you can open the{" "}
              <Link href={`/deals/${dealId}/join?as=seller`} className="inline-flex min-h-11 items-center font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline">
                seller&apos;s join page
              </Link>{" "}
              yourself.</>
          ) : (
            <>Waiting for the {other}. In demo mode you can{" "}
              <Link href={`/deals/${dealId}?as=${other}`} className="inline-flex min-h-11 items-center font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline">
                switch to the {other} view
              </Link>{" "}
              and make that move yourself.</>
          )}
        </p>
      ) : null}
    </Shell>
  );
}
