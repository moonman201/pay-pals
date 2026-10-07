/**
 * Shape of a deterministic red-flag rule. Rules see the card, the shared chat
 * and the price check, and return flags with raisedByRule set to true.
 */
import type { ItemCard, Message, PriceCheck, RedFlag } from "@pay-pals/contracts";

export interface SellerIdentity {
  displayName: string;
  email: string;
}

export interface RuleInput {
  card: ItemCard;
  /** Messages on the shared "deal" channel. Other channels are ignored. */
  chat: Message[];
  priceCheck: PriceCheck | null;
  /** The seller as the deal knows them. Optional because the contract's review() does not carry it. */
  seller?: SellerIdentity | null;
}

export type Rule = (input: RuleInput) => RedFlag[];
