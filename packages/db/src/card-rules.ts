/**
 * When a card may be saved, agreed to or locked, by deal state. Both stores
 * call these so the rules live in one place: the card changes only until
 * AGREED (isCardEditable from contracts), each side agrees while the deal is
 * LISTED or REVIEWED, and the card is locked at REVIEWED, just before the
 * move to AGREED (or at AGREED itself, for callers that transition first).
 */
import { isCardEditable } from "@pay-pals/contracts";
import type { Deal, DealEvent, DealState } from "@pay-pals/contracts";
import { AgreementNotAllowedError, CardNotEditableError } from "./errors";

export const CARD_LOCKABLE_STATES: readonly DealState[] = ["REVIEWED", "AGREED"];
export const AGREEMENT_STATES: readonly DealState[] = ["LISTED", "REVIEWED"];

export type AgreeingRole = "buyer" | "seller";

export function assertCardSavable(dealId: string, state: DealState): void {
  if (!isCardEditable(state)) throw new CardNotEditableError(dealId, state, "save");
}

export function assertCardLockable(dealId: string, state: DealState): void {
  if (!CARD_LOCKABLE_STATES.includes(state)) throw new CardNotEditableError(dealId, state, "lock");
}

export function assertAgreementAllowed(dealId: string, state: DealState): void {
  if (!AGREEMENT_STATES.includes(state)) throw new AgreementNotAllowedError(dealId, state);
}

export const agreementField = (role: AgreeingRole): "buyerAgreedAt" | "sellerAgreedAt" =>
  role === "buyer" ? "buyerAgreedAt" : "sellerAgreedAt";

/** The timeline line written when one side agrees. */
export function agreedEvent(deal: Deal, role: AgreeingRole, at: string): Omit<DealEvent, "id"> {
  return {
    dealId: deal.id,
    kind: "agreed",
    actor: role,
    summary: `The ${role} agreed to card version ${deal.currentCardVersion}.`,
    data: { role, cardVersion: deal.currentCardVersion },
    at,
  };
}
