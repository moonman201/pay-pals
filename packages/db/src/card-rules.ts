/**
 * When a card may be saved or locked, by deal state. Both stores call these
 * so the rule lives in one place: the card changes only until AGREED
 * (isCardEditable from contracts) and is locked at REVIEWED, just before the
 * move to AGREED (or at AGREED itself, for callers that transition first).
 */
import { isCardEditable } from "@pay-pals/contracts";
import type { DealState } from "@pay-pals/contracts";
import { CardNotEditableError } from "./errors";

export const CARD_LOCKABLE_STATES: readonly DealState[] = ["REVIEWED", "AGREED"];

export function assertCardSavable(dealId: string, state: DealState): void {
  if (!isCardEditable(state)) throw new CardNotEditableError(dealId, state, "save");
}

export function assertCardLockable(dealId: string, state: DealState): void {
  if (!CARD_LOCKABLE_STATES.includes(state)) throw new CardNotEditableError(dealId, state, "lock");
}
