"use client";

import { isTerminal, type DealState, type Verdict } from "@pay-pals/contracts";
import Link from "next/link";
import { useState } from "react";
import { allowedActions, isWaitingOnOther, type ActionId } from "@/lib/deal/actions";
import { BLOCKED_SENTENCE, gateFor } from "@/lib/deal/override";
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
  onAction: (id: ActionId, opts?: { override?: boolean }) => void;
}

const VARIANT: Partial<Record<ActionId, ButtonVariant>> = { cancel: "danger", report_issue: "danger", complete: "primary" };

const ENDINGS: Partial<Record<DealState, string>> = {
  COMPLETE: "This deal is complete. Both sides have the locked card, the payment record and the photos.",
  BLOCKED: BLOCKED_SENTENCE + " No order was created and no money moved.",
  ISSUE: "An issue is open. The evidence pack is ready to attach to a PayPal dispute.",
  CANCELLED: "This deal was cancelled before any money moved.",
};

/** The moves this side can make right now, straight from the transition table. */
export function ActionBar({ state, role, verdict, dealId, busy, hasLockedCard, onAction }: Props) {
  const [understood, setUnderstood] = useState(false);
  const actions = allowedActions(state, role);
  const gate = state === "REVIEWED" ? gateFor(verdict) : "open";
  const other = otherRole(role);

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
      {gate === "override" ? (
        <label className="mb-3 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5" />
          <span>I understand, continue anyway. My pal raised flags and I have read them.</span>
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => {
          if (a.id === "agree" && gate === "blocked") return null;
          const disabled = busy !== null || (a.id === "agree" && gate === "override" && !understood);
          const variant: ButtonVariant = VARIANT[a.id] ?? (a.id === "cancel" ? "danger" : actions.length > 1 && a.id !== actions[0]?.id ? "secondary" : "primary");
          return (
            <Button key={a.id} variant={variant} disabled={disabled} onClick={() => onAction(a.id, { override: a.id === "agree" && gate === "override" })}>
              {busy === a.id ? "Working" : a.label}
            </Button>
          );
        })}
      </div>
      {isWaitingOnOther(state, role) ? (
        <p className="mt-3 text-sm text-muted">
          Waiting for the {other}. In demo mode you can{" "}
          <Link href={`/deals/${dealId}?as=${other}`} className="font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline">
            switch to the {other} view
          </Link>{" "}
          and make that move yourself.
        </p>
      ) : null}
    </Panel>
  );
}
