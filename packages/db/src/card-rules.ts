/**
 * When a card may be saved, agreed to or locked, and when the seller may
 * join, by deal state. Both stores call these so the rules live in one
 * place: the card changes only until AGREED (isCardEditable from contracts),
 * each side agrees while the deal is LISTED or REVIEWED, the card is locked
 * at REVIEWED just before the move to AGREED (or at AGREED itself), and the
 * seller joins any time after the invite goes out and before the deal ends.
 */
import { isCardEditable, isTerminal } from "@pay-pals/contracts";
import type { Deal, DealState, Party } from "@pay-pals/contracts";
import { AgreementNotAllowedError, CardNotEditableError, SellerJoinNotAllowedError } from "./errors";
import type { NewEvent } from "./event-chain";

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

/**
 * The seller may join from INVITED onward while the deal is still live:
 * not in DRAFT (nothing has been sent yet) and not in a terminal state.
 * A seller-started deal never calls this, but it is harmless if it does.
 */
export function assertSellerMayJoin(dealId: string, state: DealState): void {
  if (state === "DRAFT" || isTerminal(state)) throw new SellerJoinNotAllowedError(dealId, state);
}

export const agreementField = (role: AgreeingRole): "buyerAgreedAt" | "sellerAgreedAt" =>
  role === "buyer" ? "buyerAgreedAt" : "sellerAgreedAt";

/** The timeline line written when one side agrees. */
export function agreedEvent(deal: Deal, role: AgreeingRole, at: string): NewEvent {
  return {
    dealId: deal.id,
    kind: "agreed",
    actor: role,
    summary: `The ${role} agreed to card version ${deal.currentCardVersion}.`,
    data: { role, cardVersion: deal.currentCardVersion },
    at,
  };
}

/** The timeline line written when the seller opens the invite. */
export function sellerJoinedEvent(deal: Deal, at: string): NewEvent {
  return {
    dealId: deal.id,
    kind: "seller_joined",
    actor: "seller",
    summary: `${deal.seller.displayName} joined the deal.`,
    at,
  };
}

/** Merges what the join form told us about the seller; email and name only. */
export function mergeSeller(current: Party, update: Partial<Party> | undefined): Party {
  return {
    role: "seller",
    displayName: update?.displayName?.trim() || current.displayName,
    email: update?.email?.trim() || current.email,
  };
}
