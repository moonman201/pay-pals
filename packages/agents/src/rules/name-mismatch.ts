/**
 * NAME_MISMATCH: the PayPal address getting paid does not carry any part of
 * the seller's name. Caution. Compares the seller's display name with the
 * local part of sellerPaypalEmail. Runs only when the seller's identity is
 * supplied, because review() in the contract does not carry it; apps/web
 * passes it as review context.
 *
 * The seller's own contact email is deliberately not a way through. Two
 * addresses that agree with each other prove nothing about whether either
 * belongs to someone called Chris W.
 *
 * Three outcomes, because "could not tell" is not "agrees":
 *   match        the address carries the first name or the surname
 *   mismatch     the name has usable parts and the address carries none
 *   undecidable  no part of the name is long enough to look for (initials only)
 */
import type { Rule, SellerIdentity } from "./types";
import { flag } from "./text";

export type PayeeNameCheck = "match" | "mismatch" | "undecidable";

/** Letters only, accents folded, so "José" is looked for as "jose". */
function letters(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
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
  return tokens.some((token) => local.includes(token)) ? "match" : "mismatch";
}

export const nameMismatchRule: Rule = ({ card, seller }) => {
  if (!card || !seller) return [];
  if (checkPayeeName(seller, card.sellerPaypalEmail) !== "mismatch") return [];
  return [
    flag(
      "NAME_MISMATCH",
      "caution",
      `PayPal address ${card.sellerPaypalEmail}, seller name ${seller.displayName}`,
      "The PayPal address that gets paid does not contain the seller's name.",
    ),
  ];
};
