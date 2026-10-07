/**
 * Shape of a deterministic red-flag rule. Rules see the card (null when the
 * review runs from the chat alone), the shared chat, the price check and the
 * grader's record, and return flags with raisedByRule set to true.
 */
import type { CertRecord, ItemCard, Message, PriceCheck, RedFlag } from "@pay-pals/contracts";

export interface SellerIdentity {
  displayName: string;
  email: string;
}

export interface RuleInput {
  /** Null when there is no item card yet. Card rules then return nothing. */
  card: ItemCard | null;
  /** Messages on the shared "deal" channel. Other channels are ignored. */
  chat: Message[];
  priceCheck: PriceCheck | null;
  /** The seller as the deal knows them. Optional because the contract's review() does not carry it. */
  seller?: SellerIdentity | null;
  /** The grader's record for card.certNumber, looked up before the rules run. */
  certRecord?: CertRecord | null;
  /** True when the seller declined the Pay Pals invite. */
  inviteDeclined?: boolean;
}

export type Rule = (input: RuleInput) => RedFlag[];
