/**
 * Shape of a deterministic red-flag rule. Rules see the card (null when the
 * review runs from the chat alone), the shared chat, the price check, the
 * grader's record and any photo matches, and return flags with raisedByRule
 * set to true.
 */
import type { CertRecord, ItemCard, Message, Photo, PriceCheck, RedFlag } from "@pay-pals/contracts";

export interface SellerIdentity {
  displayName: string;
  email: string;
}

/** A card photo that is the same picture as a known photo from somewhere else. */
export interface PhotoMatch {
  photo: Photo;
  source: string;
  /** Hamming distance between the two perceptual hashes, 0 to 64. */
  distance: number;
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
  /** Card photos found to be the same picture as a known photo, from the image check. */
  photoMatches?: PhotoMatch[];
}

export type Rule = (input: RuleInput) => RedFlag[];
