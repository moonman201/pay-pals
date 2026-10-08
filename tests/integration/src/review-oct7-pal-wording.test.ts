/**
 * Live site review, Oct 7, PLAN item 14: no pal output may say it could
 * not open the photos. Every fixture goes through buildCard, review,
 * checkArrival and buildEvidencePack with the real rules-only pals, and
 * every sentence a person can read is checked.
 *
 * Red until PLAN item 1 (builder-agents, with builder-web for absolute photo
 * URLs) lands: today the fixture photo paths are not fetchable, so the pals
 * fall back to the captions and say so.
 */
import { describe, expect, it } from "vitest";
import { ALL_FIXTURES } from "@pay-pals/contracts";
import type { EvidenceInput, ScenarioFixture } from "@pay-pals/contracts";
import { buildEvidencePack, createBuyerPal, createFixtureCertLookup, createFixturePriceLookup, createSellerPal } from "@pay-pals/agents";

/** The sentence Matt saw, and the softer ways the same fallback is worded. */
const FORBIDDEN = [/could not open/i, /went by (?:the |your )?photo descriptions/i, /photo descriptions/i, /image files/i];

const buyerPal = createBuyerPal({ anthropic: null, priceLookup: createFixturePriceLookup(), certLookup: createFixtureCertLookup() });
const sellerPal = createSellerPal({ anthropic: null });

function expectClean(text: string, where: string): void {
  for (const pattern of FORBIDDEN) {
    expect(text, `${where} must not say it could not read the photos: ${JSON.stringify(text)}`).not.toMatch(pattern);
  }
}

async function evidenceInput(fixture: ScenarioFixture): Promise<EvidenceInput> {
  const card = fixture.cards.at(-1)!;
  const verdict = (await buyerPal.review(card, fixture.chat, { dealId: fixture.deal.id, seller: fixture.seller, sellerJoined: true })).data;
  const arrival = fixture.arrivalPhotos.length > 0 ? (await buyerPal.checkArrival(card, fixture.arrivalPhotos)).data : null;
  return {
    deal: fixture.deal,
    lockedCard: card,
    verdicts: [verdict],
    arrivalCheck: arrival,
    messages: fixture.chat,
    payment: fixture.payment,
    shipment: fixture.shipment,
    timeline: fixture.timeline,
    arrivalPhotos: fixture.arrivalPhotos,
    requestedBy: "buyer",
  };
}

describe.each(ALL_FIXTURES.map((f) => [f.id, f] as const))("pal output on %s never says it could not open the photos", (_id, fixture) => {
  it("Seller Pal buildCard", async () => {
    const { data: card, palMessage } = await sellerPal.buildCard({
      dealId: fixture.deal.id,
      listingText: fixture.listingText,
      photos: fixture.listingPhotos,
      sellerNotes: fixture.sellerNotes,
      sellerPaypalEmail: fixture.cards[0]!.sellerPaypalEmail,
      askingPrice: fixture.cards[0]!.askingPrice,
    });
    expectClean(palMessage, "buildCard palMessage");
    expectClean(card.conditionNotes, "buildCard conditionNotes");
  });

  it("Buyer Pal review", async () => {
    const card = fixture.cards.at(-1)!;
    const { data: verdict, palMessage } = await buyerPal.review(card, fixture.chat, { dealId: fixture.deal.id, seller: fixture.seller, sellerJoined: true });
    expectClean(palMessage, "review palMessage");
    expectClean(verdict.palMessage, "verdict palMessage");
    for (const flag of verdict.flags) {
      expectClean(flag.explanation, `flag ${flag.code} explanation`);
      expectClean(flag.evidence, `flag ${flag.code} evidence`);
    }
    for (const q of verdict.questionsForSeller) expectClean(q, "question for the seller");
    if (verdict.certCheck) expectClean(verdict.certCheck.explanation, "cert check explanation");
  });

  it("Buyer Pal checkArrival", async ({ skip }) => {
    if (fixture.arrivalPhotos.length === 0) skip();
    const { data: check, palMessage } = await buyerPal.checkArrival(fixture.cards.at(-1)!, fixture.arrivalPhotos);
    expectClean(palMessage, "arrival palMessage");
    expectClean(check.palMessage, "arrival check palMessage");
    for (const m of check.mismatches) expectClean(m.explanation, `mismatch ${m.field} explanation`);
  });

  it("evidence pack summary", async () => {
    const { data: pack, palMessage } = await buildEvidencePack(await evidenceInput(fixture), { anthropic: null });
    expectClean(palMessage, "evidence palMessage");
    expectClean(pack.summary, "evidence summary");
  });
});
