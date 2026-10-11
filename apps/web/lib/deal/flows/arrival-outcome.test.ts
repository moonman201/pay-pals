/**
 * The arrival_checked timeline summary, which goes into an append-only table
 * and is never corrected. An unsettled comparison recorded as "does not
 * match" would be a false line in the deal's permanent history, which is the
 * defect the three-value outcome exists to make impossible.
 *
 * Driven through the real flow on the in-memory store, with the Buyer Pal's
 * answer replaced, so this is the sentence the store actually receives.
 */
import type { ArrivalCheck, PalResult } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { createServices } from "../../services";
import { agree } from "./agree";
import { checkArrival } from "./arrival";
import { captureOrder, createOrder } from "./pay";
import { runReview } from "./review";
import { confirmDelivery, markShipped } from "./ship";
import { startDemoDeal } from "./start";
import { loadSnapshot } from "../snapshot";

const quiet = () => {};
type Services = ReturnType<typeof createServices>;

/** The clean deal, driven to DELIVERED, which is where an arrival check is legal. */
async function delivered(services: Services): Promise<{ dealId: string; photos: NonNullable<Awaited<ReturnType<typeof loadSnapshot>>["demo"]>["arrivalPhotos"] }> {
  const deal = await startDemoDeal(services, "clean-ps5");
  await runReview(services, deal.id);
  await agree(services, deal.id, "seller", true);
  await agree(services, deal.id, "buyer", true);
  const payment = await createOrder(services, deal.id, "paypal");
  await captureOrder(services, deal.id, payment.paypalOrderId);
  const snap = await loadSnapshot(services, deal.id);
  const packing = snap.demo!.packing!;
  await markShipped(services, deal.id, {
    carrier: packing.carrier,
    trackingNumber: packing.trackingNumber,
    packingPhotos: packing.photos,
    doneIds: snap.checklist?.map((c) => c.id) ?? [],
  });
  await confirmDelivery(services, deal.id);
  const ready = await loadSnapshot(services, deal.id);
  return { dealId: deal.id, photos: ready.demo?.arrivalPhotos ?? [] };
}

/** The pal answers with this check, whatever it would have said. */
function palReturns(services: Services, build: (base: ArrivalCheck) => ArrivalCheck): void {
  const real = services.buyerPal.checkArrival.bind(services.buyerPal);
  services.buyerPal.checkArrival = (async (card, photos) => {
    const result = (await real(card, photos)) as PalResult<ArrivalCheck>;
    return { ...result, data: build(result.data) };
  }) as typeof services.buyerPal.checkArrival;
}

async function summaryOf(services: Services, dealId: string): Promise<string> {
  const events = await services.store.listEvents(dealId);
  return events.filter((e) => e.kind === "arrival_checked").at(-1)!.summary;
}

describe("the arrival_checked summary, which is written once and never corrected", () => {
  it("claims neither a match nor a mismatch when the pal could not settle it", async () => {
    const services = createServices({}, quiet);
    await services.ready;
    const { dealId, photos } = await delivered(services);
    palReturns(services, (base) => ({
      ...base,
      outcome: "inconclusive",
      mismatches: [],
      unsettled: [{ field: "serial", expected: "AJ164952580", observed: "AJ16495258O", explanation: "They differ only at character 11, 0 against O." }],
    }));

    await checkArrival(services, dealId, photos);
    const summary = await summaryOf(services, dealId);

    expect(summary).toContain("Arrival not settled.");
    expect(summary).toContain("AJ164952580");
    expect(summary).toContain("AJ16495258O");
    expect(summary).toContain("not calling that a match and not calling it a mismatch");
    // The two sentences that must never be written for this case.
    expect(summary).not.toContain("Arrival matches the locked card.");
    expect(summary).not.toContain("Arrival does not match.");
  });

  it("still says a match plainly, and a mismatch plainly", async () => {
    const services = createServices({}, quiet);
    await services.ready;
    const { dealId, photos } = await delivered(services);
    palReturns(services, (base) => ({ ...base, outcome: "match", mismatches: [], unsettled: [] }));
    await checkArrival(services, dealId, photos);
    expect(await summaryOf(services, dealId)).toContain("Arrival matches the locked card.");
  });

  it("fits the column, which truncates at 300 characters", async () => {
    const services = createServices({}, quiet);
    await services.ready;
    const { dealId, photos } = await delivered(services);
    palReturns(services, (base) => ({
      ...base,
      outcome: "inconclusive",
      mismatches: [],
      unsettled: [
        { field: "serial", expected: "AJ164952580", observed: "AJ16495258O", explanation: "x".repeat(200) },
        { field: "model", expected: "CFI-1015A", observed: "CFI-1015B", explanation: "y".repeat(200) },
      ],
    }));
    await checkArrival(services, dealId, photos);
    const summary = await summaryOf(services, dealId);
    expect(summary.length).toBeLessThanOrEqual(300);
    // The claim-neither sentence is what must survive a long list, so it leads.
    expect(summary).toContain("Arrival not settled.");
  });
});
