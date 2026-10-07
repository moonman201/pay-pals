/**
 * Fixture-backed BuyerPal. For a demo scenario it answers with the scenario's
 * expected verdict and arrival result. For anything else it applies two
 * plain rules: no serial means caution, and an arrival serial that differs
 * from the locked card means a mismatch.
 */
import type { ArrivalCheck, BuyerPal, ItemCard, Message, Mismatch, PalResult, Photo, Verdict } from "@pay-pals/contracts";
import { fixtureForCard, readModel, readSerial } from "./fixture-match";
import { nowIso } from "./ids";
import { verdictFromFixture } from "./verdicts";

function genericVerdict(card: ItemCard): Verdict {
  const missingSerial = card.serial === null;
  return {
    dealId: card.dealId,
    cardVersion: card.version,
    overall: missingSerial ? "caution" : "go",
    flags: missingSerial
      ? [
          {
            code: "MISSING_SERIAL",
            severity: "caution",
            evidence: "Card field serial: none",
            explanation: "There is no serial number on the card, so the item cannot be matched on arrival.",
            raisedByRule: true,
          },
        ]
      : [],
    priceCheck: null,
    questionsForSeller: missingSerial ? ["Can you add a photo of the serial number on the item?"] : [],
    palMessage: missingSerial
      ? "I could not find a serial number on the card. Without one I cannot prove what arrives is what was sold. I have asked the seller for it. You can still continue if you accept that."
      : "The card has a serial and a clear condition note. I have no market price for this item in demo mode, so check the price yourself. You can agree when you are ready.",
    createdAt: nowIso(),
  };
}

function describeArrival(matches: boolean, mismatches: Mismatch[]): string {
  if (matches) return "What arrived matches the locked card. The serial is the one on the card. You can complete the deal.";
  const list = mismatches.map((m) => `${m.field}: card says ${m.expected}, arrived ${m.observed}`).join("; ");
  return `What arrived does not match the locked card. ${list}. I recommend reporting an issue. I will build the evidence pack for a PayPal dispute.`;
}

export function createMockBuyerPal(): BuyerPal {
  return {
    async review(card: ItemCard, chat: Message[]): Promise<PalResult<Verdict>> {
      const fixture = fixtureForCard(card);
      const verdict = fixture ? verdictFromFixture(fixture, card, chat) : genericVerdict(card);
      return { data: verdict, palMessage: verdict.palMessage };
    },

    async checkArrival(lockedCard: ItemCard, arrivalPhotos: Photo[]): Promise<PalResult<ArrivalCheck>> {
      const text = arrivalPhotos.map((p) => p.whatItShows).join(" ");
      const observedSerial = readSerial(text);
      const observedModel = readModel(text);
      const fixture = fixtureForCard(lockedCard);
      const expected = fixture?.expectedArrival ?? null;

      const mismatches: Mismatch[] = [];
      const serialDiffers = observedSerial !== null && lockedCard.serial !== null && observedSerial !== lockedCard.serial;
      const wantSerial = expected ? expected.mismatchFields.includes("serial") : serialDiffers;
      if (wantSerial) {
        mismatches.push({
          field: "serial",
          expected: lockedCard.serial ?? "none on card",
          observed: observedSerial ?? "not readable",
          explanation: "The serial on the item that arrived is not the serial on the locked card.",
        });
      }
      const wantModel = expected ? expected.mismatchFields.includes("model") : observedModel !== null && !lockedCard.model.toLowerCase().includes(observedModel.toLowerCase());
      if (wantModel) {
        mismatches.push({
          field: "model",
          expected: lockedCard.model,
          observed: observedModel ?? "different model",
          explanation: "The model that arrived is not the model on the locked card.",
        });
      }
      const matches = expected ? expected.matches : mismatches.length === 0;
      const check: ArrivalCheck = {
        dealId: lockedCard.dealId,
        cardVersion: lockedCard.version,
        matches,
        mismatches,
        observed: { brand: observedModel || observedSerial ? lockedCard.brand : null, model: observedModel, serial: observedSerial },
        palMessage: describeArrival(matches, mismatches),
        createdAt: nowIso(),
      };
      return { data: check, palMessage: check.palMessage };
    },
  };
}
