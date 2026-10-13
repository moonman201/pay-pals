/**
 * The look-again line as the real keyless pal writes it for each demo
 * scenario: asks join with "or" and the line ends with a full stop.
 */
import { describe, expect, it } from "vitest";
import { createServices } from "../../services";
import { reviewLead } from "../review-lead";
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
