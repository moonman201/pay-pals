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

export const GRADED_PRICE_LINK_LEAD = "Check recent sold prices on";

/** A graded card is one with a cert number on it. That is the same test the cert comparison uses. */
export function isGradedCard(card: ItemCard | null | undefined): boolean {
  return Boolean(card?.certNumber);
}

/**
 * What to search for: the card's title, plus its grade because a PSA 10 and
 * a PSA 9 are different prices, unless the title already says it. The cert
 * number stays out because it identifies one slab and would return nothing.
 */
function gradedSearchQuery(card: ItemCard): string {
  const title = card.title.trim();
  const grade = card.grade?.trim();
  if (!grade || title.toLowerCase().includes(grade.toLowerCase())) return title;
  return `${title} ${grade}`;
}

export function gradedPriceSearchUrl(card: ItemCard): string {
  return `https://www.pricecharting.com/search-products?q=${encodeURIComponent(gradedSearchQuery(card))}&type=prices`;
}

export function graded130pointSearchUrl(card: ItemCard): string {
  return `https://130point.com/sales/?search=${encodeURIComponent(gradedSearchQuery(card))}`;
}

/** The two places that track graded sales, each as a search for this card. */
export function gradedPriceLinks(card: ItemCard): { name: string; href: string }[] {
  return [
    { name: "PriceCharting", href: gradedPriceSearchUrl(card) },
    { name: "130point", href: graded130pointSearchUrl(card) },
  ];
}
