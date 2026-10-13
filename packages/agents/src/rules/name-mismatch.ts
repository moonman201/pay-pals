/**
 * NAME_MISMATCH: the PayPal address getting paid looks like a throwaway or a
 * deals/cash front. Caution. Runs only when the seller's identity is supplied,
 * because review() in the contract does not carry it; apps/web passes it as
 * review context.
 *
 * An address with no part of the seller's name in it is NOT a flag on its own.
 * Honest sellers often have addresses with no name in them (info@, mkpaints@).
 * That case is an open question the review reports under couldNotVerify.
 * The flag needs the address itself to look like a front: its local part is
 * made of words like cash, deals or quick. Digits alone never count.
 *
 * The seller's own contact email is deliberately not a way through. Two
 * addresses that agree with each other prove nothing about whether either
 * belongs to someone called Chris W.
 *
 * checkPayeeName gives three outcomes, because "could not tell" is not "agrees":
 *   match        the address carries the first name or the surname
 *   unconfirmed  the name has usable parts and the address carries none
 *   undecidable  no part of the name is long enough to look for (initials only)
 */
import type { Rule, SellerIdentity } from "./types";
import { flag } from "./text";

export type PayeeNameCheck = "match" | "unconfirmed" | "undecidable";

/** Letters only, accents folded, so "José" is looked for as "jose". */
function letters(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function localPart(email: string): string {
  return letters(email.split("@")[0] ?? "").replace(/[^a-z]/g, "");
}

/** Name parts of three letters or more. "Chris W." gives ["chris"]; a lone initial is too weak to look for. */
function nameTokens(displayName: string): string[] {
  return letters(displayName)
    .split(/[^a-z]+/)
    .filter((t) => t.length >= 3);
}

export function checkPayeeName(seller: Pick<SellerIdentity, "displayName">, paypalEmail: string): PayeeNameCheck {
  const tokens = nameTokens(seller.displayName);
  if (tokens.length === 0) return "undecidable";
  const local = localPart(paypalEmail);
  return tokens.some((token) => local.includes(token)) ? "match" : "unconfirmed";
}

/** Whole words that make an address read as a deals or cash account. */
export const FRONT_WORDS = ["cash", "deal", "deals", "quick", "fast", "cheap", "bargain", "bargains", "discount", "discounts", "sale", "sales", "payme", "money"] as const;

/** Words of the local part, split on dots, digits, underscores, hyphens, plus signs and camel case. */
function localWords(email: string): string[] {
  const local = (email.split("@")[0] ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  return local
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/** True when the whole word is front words run together, so "cashdeals" counts and "dealer" does not. */
function isFrontWord(word: string): boolean {
  if (word.length === 0) return true;
  return FRONT_WORDS.some((front) => word.startsWith(front) && isFrontWord(word.slice(front.length)));
}

/** True when the address looks like a throwaway or a deals/cash front. Digits alone never make it one. */
export function looksLikeFront(paypalEmail: string): boolean {
  return localWords(paypalEmail).some((word) => isFrontWord(word));
}

export const nameMismatchRule: Rule = ({ card, seller }) => {
  if (!card || !seller) return [];
  if (checkPayeeName(seller, card.sellerPaypalEmail) === "match") return [];
  if (!looksLikeFront(card.sellerPaypalEmail)) return [];
  return [
    flag(
      "NAME_MISMATCH",
      "caution",
      `PayPal address ${card.sellerPaypalEmail}, seller name ${seller.displayName}`,
      "The PayPal address that gets paid looks like a deals account, not a person's.",
    ),
  ];
};
