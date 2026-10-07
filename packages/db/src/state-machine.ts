/**
 * The one place a stored deal changes state. Both store implementations call
 * this so the transition table from contracts is enforced the same way.
 */
import { assertTransition } from "@pay-pals/contracts";
import type { Deal, DealEvent, DealState } from "@pay-pals/contracts";
import type { NewEvent } from "./event-chain";

export interface TransitionPlan {
  from: DealState;
  to: DealState;
  event: NewEvent;
}

/** Throws IllegalTransitionError when the move is not in DEAL_TRANSITIONS. */
export function planTransition(
  deal: Deal,
  to: DealState,
  actor: DealEvent["actor"],
  summary: string,
  at: string = new Date().toISOString(),
): TransitionPlan {
  assertTransition(deal.state, to);
  return {
    from: deal.state,
    to,
    event: { dealId: deal.id, kind: "state_changed", actor, summary, fromState: deal.state, toState: to, at },
  };
}
