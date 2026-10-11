/**
 * NAME_MISMATCH: the PayPal account getting paid does not look like it
 * belongs to the person selling. Caution. Compares the seller's display name
 * (and their contact email) with the local part of sellerPaypalEmail. Runs
 * only when the seller's identity is supplied, because review() in the
 * contract does not carry it; apps/web passes it as review context.
 */
import type { Rule } from "./types";
import { flag } from "./text";

function localPart(email: string): string {
  return (email.split("@")[0] ?? "").toLowerCase();
}

function nameTokens(displayName: string): string[] {
  return displayName
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((t) => t.length >= 3);
}

/** True when the PayPal local part shares a real name token with the seller. */
export function paypalEmailLooksLikeSeller(seller: { displayName: string; email: string }, paypalEmail: string): boolean {
  const paypalLocal = localPart(paypalEmail);
  if (paypalLocal === localPart(seller.email)) return true;
  const tokens = nameTokens(seller.displayName);
  if (tokens.length === 0) return true;
  return tokens.some((token) => paypalLocal.includes(token));
}

export const nameMismatchRule: Rule = ({ card, seller }) => {
  if (!card || !seller) return [];
  if (paypalEmailLooksLikeSeller(seller, card.sellerPaypalEmail)) return [];
  return [
    flag(
      "NAME_MISMATCH",
      "caution",
      `Seller ${seller.displayName} (${seller.email}) but the PayPal account that gets paid is ${card.sellerPaypalEmail}`,
      "The PayPal account that gets paid is not the seller's name.",
    ),
  ];
};
