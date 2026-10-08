"use client";

import { isTerminal, type DealState, type Verdict } from "@pay-pals/contracts";
import Link from "next/link";
import { useState } from "react";
import { agreeLabel, allowedActions, hasAgreed, isWaitingOnOther, type ActionId, type Agreement } from "@/lib/deal/actions";
import { BLOCKED_SENTENCE, CAUTION_CHECKBOX, gateFor, STOP_CHECKBOX, stopWarning } from "@/lib/deal/override";
import { otherRole, type Role } from "@/lib/role";
import { Button, type ButtonVariant } from "../ui/Button";
import { Panel } from "../ui/Panel";

interface Props {
  state: DealState;
  role: Role;
  verdict: Verdict | null;
  dealId: string;
  busy: string | null;
  hasLockedCard: boolean;
  agreement: Agreement;
  cardVersion: number;
  /** This side agreed to an earlier version and the card changed since. */
  cardChangedSinceAgree: boolean;
  /** In INVITED: there is a refusal or a pasted reply for the Buyer Pal to review. */
  refusalToReview?: boolean;
  onAction: (id: ActionId, opts?: { override?: boolean }) => void;
}

const VARIANT: Partial<Record<ActionId, ButtonVariant>> = { cancel: "danger", report_issue: "danger", complete: "primary" };

/** What to say under the buttons while a slow move runs. Claude reviews can take ten seconds or more. */
const WORKING_NOTES: Partial<Record<ActionId, string>> = {
  review: "Your pal is reading the chat and checking prices. This can take a few seconds.",
  agree: "Recording your agreement.",
  report_issue: "Opening the issue and building the evidence pack.",
};

const ENDINGS: Partial<Record<DealState, string>> = {
  COMPLETE: "This deal is complete. Both sides have the locked card, the payment record and the photos.",
  BLOCKED: BLOCKED_SENTENCE + " No order was created and no money moved.",
  ISSUE: "An issue is open. The evidence pack is ready to attach to a PayPal dispute.",
  CANCELLED: "This deal was cancelled before any money moved.",
};

/** The moves this side can make right now, straight from the transition table. */
export function ActionBar({ state, role, verdict, dealId, busy, hasLockedCard, agreement, cardVersion, cardChangedSinceAgree, refusalToReview = false, onAction }: Props) {
  const [understood, setUnderstood] = useState(false);
  const other = otherRole(role);
  const agreeing = state === "REVIEWED" && cardVersion > 0;
  const mineDone = agreeing && hasAgreed(agreement, role);
  // The buyer's override rules apply only to the buyer's agree.
  const gate = agreeing && role === "buyer" ? gateFor(verdict) : "open";
  const needsCheckbox = gate === "override" || gate === "stop_override";
  const actions = allowedActions(state, role).filter((a) => {
    if (a.id === "agree") return cardVersion > 0 && !mineDone && gate !== "blocked";
    // In INVITED the Buyer Pal has nothing to review until the seller refuses or the buyer pastes a reply.
    if (a.id === "review" && state === "INVITED") return refusalToReview;
    return true;
  });
  const waiting = isWaitingOnOther(state, role) || (actions.every((a) => a.id === "cancel") && (mineDone || state === "INVITED" || (state === "REVIEWED" && cardVersion === 0)));

  if (isTerminal(state)) {
    return (
      <Panel title="Next step" accent>
        <p className="text-sm">{ENDINGS[state]}</p>
        {hasLockedCard ? (
          <Link href={`/deals/${dealId}/evidence?as=${role}`} className="mt-2 inline-block text-sm font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline">
            Open the evidence pack
          </Link>
        ) : null}
      </Panel>
    );
  }

  return (
    <Panel title="Next step" accent>
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
      {state === "INVITED" && refusalToReview && role === "buyer" ? (
        <p className="mb-3 text-sm">The seller has not joined. Ask your pal to review what they said before you do anything else.</p>
      ) : null}
      {agreeing && cardChangedSinceAgree && !mineDone ? (
        <p className="mb-3 text-sm text-caution">Card changed since you agreed. Read version {cardVersion} and agree again.</p>
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
          const disabled = busy !== null || (a.id === "agree" && needsCheckbox && !understood);
          const variant: ButtonVariant = VARIANT[a.id] ?? (a.id === "cancel" ? "danger" : actions.length > 1 && a.id !== actions[0]?.id ? "secondary" : "primary");
          const label = a.id === "agree" ? agreeLabel(role, agreement) : a.id === "review" && state === "INVITED" ? "Ask my pal to review the refusal" : a.label;
          return (
            <Button key={a.id} variant={variant} disabled={disabled} onClick={() => onAction(a.id, { override: a.id === "agree" && needsCheckbox })}>
              {busy === a.id ? "Working" : label}
            </Button>
          );
        })}
      </div>
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
              <Link href={`/deals/${dealId}/join?as=seller`} className="font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline">
                seller&apos;s join page
              </Link>{" "}
              yourself.</>
          ) : (
            <>Waiting for the {other}. In demo mode you can{" "}
              <Link href={`/deals/${dealId}?as=${other}`} className="font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline">
                switch to the {other} view
              </Link>{" "}
              and make that move yourself.</>
          )}
        </p>
      ) : null}
    </Panel>
  );
}
