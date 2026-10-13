/**
 * The look-again line as the real keyless pal writes it for each demo
 * scenario: asks join with "or" and the line ends with a full stop.
 */
import { describe, expect, it } from "vitest";
import { createServices } from "../../services";
import { reviewLead } from "../review-lead";
import { sellerVoice } from "../seller-voice";
import { runReview } from "./review";
import { startDemoDeal } from "./start";

describe("the look-again line on a real review", () => {
  for (const scenario of ["clean-ps5", "empty-box", "fake-slab"] as const) {
    it(`${scenario}: ends with a full stop and has no run-on`, async () => {
      const services = createServices({}, () => {});
      await services.ready;
      const dealId = (await startDemoDeal(services, scenario)).id;
      const verdict = await runReview(services, dealId);
      const line = reviewLead(verdict).lookAgain;
      if (line === null) return;
      expect(line).toMatch(/[.!?]$/);
      // Two asks without a full stop between them must be joined by "or".
      const asks = (verdict.reasoning?.wouldChangeMyMind ?? []).slice(0, 2);
      if (asks.length === 2 && !/[.!?]$/.test(asks[0]!.trim())) expect(line).toContain(" or ");
    });
  }
});

describe("every ask has its subject, on both sides, on a real review", () => {
  const expected = {
    "clean-ps5": ["he sends a close-up of the serial label on the console.", "you send a close-up of the serial label on the console."],
    "empty-box": ["he sends a close-up of the serial label on the console.", "you send a close-up of the serial label on the console."],
    "fake-slab": [
      "he sends the slab next to his name and today's date or he agrees to Goods and Services.",
      "you send the slab next to your name and today's date or you agree to Goods and Services.",
    ],
  } as const;

  for (const scenario of ["clean-ps5", "empty-box", "fake-slab"] as const) {
    it(`${scenario}: the buyer reads "he ...", the seller reads "you ..." with the verb agreeing`, async () => {
      const services = createServices({}, () => {});
      await services.ready;
      const dealId = (await startDemoDeal(services, scenario)).id;
      const lead = reviewLead(await runReview(services, dealId));
      expect(lead.lookAgain).toBe(expected[scenario][0]);
      expect(sellerVoice(lead.lookAgain!)).toBe(expected[scenario][1]);
      // The asks the line had no room for carry a subject too.
      for (const ask of lead.restOfAsks) expect(ask).not.toMatch(/^(agrees|explains|sends|gives)\b/);
    });
  }
});
