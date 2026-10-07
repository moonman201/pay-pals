/**
 * Finds which demo scenario a card or listing came from, so the mock pals can
 * answer with that scenario's expected results. Demo deals get fresh ids, so
 * matching is by content, not by deal id.
 */
import { ALL_FIXTURES, type ItemCard, type ScenarioFixture, type ScenarioId } from "@pay-pals/contracts";

export function fixtureById(id: ScenarioId | null | undefined): ScenarioFixture | null {
  if (!id) return null;
  return ALL_FIXTURES.find((f) => f.id === id) ?? null;
}

export function fixtureForListing(listingText: string): ScenarioFixture | null {
  const wanted = listingText.trim();
  return ALL_FIXTURES.find((f) => f.listingText.trim() === wanted) ?? null;
}

export function fixtureForCard(card: ItemCard): ScenarioFixture | null {
  return (
    ALL_FIXTURES.find((f) =>
      f.cards.some((c) => c.title === card.title && c.sellerPaypalEmail === card.sellerPaypalEmail && c.askingPrice === card.askingPrice),
    ) ?? null
  );
}

/** The fixture's card one version after the given one, if the scenario has it. */
export function nextFixtureCard(fixture: ScenarioFixture, card: ItemCard): ItemCard | null {
  return fixture.cards.find((c) => c.version === card.version + 1) ?? null;
}

/** Serial numbers mentioned in photo descriptions or text, for example "serial 7LP045912". */
export function readSerial(text: string): string | null {
  const match = /serial\s*(?:number|no\.?|#)?\s*:?\s*([A-Z0-9]{6,})/i.exec(text);
  return match?.[1] ?? null;
}

/** Garmin model family mentioned in text, for example "Fenix 6" or "Fenix 7 Pro". */
export function readModel(text: string): string | null {
  const match = /(Fenix\s+\d+(?:\s+Pro)?)/i.exec(text);
  return match?.[1] ?? null;
}
