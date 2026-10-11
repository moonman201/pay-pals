/**
 * A graded card has no automatic price check, and the page has to say so
 * rather than show a number.
 *
 * Channel3 is a retail product catalog. It can price a console because
 * shops sell consoles; it cannot price one PSA 10 Gengar, because the thing
 * being sold is a single graded slab and no shop stocks it. Running the
 * lookup anyway returns either nothing or prices for a different, ungraded
 * card, and either one printed as a "market range" would be a number Pay
 * Pals made up.
 *
 * So for a card carrying a cert number this replaces the price block
 * outright: no range, no derived band, no listing count, and a link to the
 * two places that do track graded sales. Matt's rule, Oct 11: nothing
 * anywhere claims a market price for a graded card.
 */
import type { ItemCard } from "@pay-pals/contracts";

export const GRADED_PRICE_NOTE = "Price: can't check automatically. Channel3 covers retail stores, not graded cards.";

export const GRADED_PRICE_LINK_TEXT = "Check recent sold prices on PriceCharting or 130point";

/** A graded card is one with a cert number on it. That is the same test the cert comparison uses. */
export function isGradedCard(card: ItemCard | null | undefined): boolean {
  return Boolean(card?.certNumber);
}

/**
 * A search on PriceCharting for this card, by what the card says it is.
 * The grade goes in the query because a PSA 10 and a PSA 9 are different
 * prices, and the cert number does not, because it identifies one slab and
 * would return nothing.
 */
export function gradedPriceSearchUrl(card: ItemCard): string {
  const query = [card.title, card.grade].filter(Boolean).join(" ").trim();
  return `https://www.pricecharting.com/search-products?q=${encodeURIComponent(query)}&type=prices`;
}
