/**
 * The seller's next photo as the real keyless pal asks for it, one scenario
 * at a time. Nothing in the ask logic is scenario-specific, so this pins what
 * each demo actually shows a judge who plays the seller.
 */
import { describe, expect, it } from "vitest";
import { createServices } from "../../services";
import { packingAsks, photoAsk } from "../photo-ask";
import { loadSnapshot } from "../snapshot";
import { runReview } from "./review";
import { startDemoDeal } from "./start";

async function reviewed(scenario: "clean-ps5" | "empty-box" | "fake-slab") {
  const services = createServices({}, () => {});
  await services.ready;
  const dealId = (await startDemoDeal(services, scenario)).id;
  await runReview(services, dealId);
  return loadSnapshot(services, dealId);
}

describe("the seller's next photo on a real review", () => {
  it("clean-ps5: the demo close-up of the serial label is the one-tap answer", async () => {
    const snap = await reviewed("clean-ps5");
    const ask = photoAsk(snap.verdict?.questionsForSeller ?? [], snap.demo?.requestPhotos ?? []);
    expect(ask, JSON.stringify(snap.verdict?.questionsForSeller)).not.toBeNull();
    expect(ask?.photo?.whatItShows).toMatch(/close-up of the label on the back of the console/i);
  });

  it("fake-slab: the Buyer Pal's dated note is asked for, with no demo photo to pretend it", async () => {
    const snap = await reviewed("fake-slab");
    const ask = photoAsk(snap.verdict?.questionsForSeller ?? [], snap.demo?.requestPhotos ?? []);
    expect(ask?.ask, JSON.stringify(snap.verdict?.questionsForSeller)).toMatch(/note/i);
    expect(ask?.photo).toBeNull();
  });

  it("empty-box: the packing checklist asks for a photo of the items going in", () => {
    // The checklist comes at PAID. The fixture's own checklist is the same text the Seller Pal writes.
    const asks = packingAsks(
      [
        { id: "c1", label: "Photo of the console, controller and cables going into the box", required: true, done: false },
        { id: "c2", label: "Photo of the sealed box", required: true, done: false },
      ],
      [{ url: "/fixtures/empty-box/packing-sealed.jpg", whatItShows: "A shipping box taped shut along the seam, no label on it yet.", addedBy: "seller", addedAt: "2026-10-11T00:00:00.000Z" }],
    );
    expect(asks.map((a) => a.photo?.url ?? null)).toEqual([null, "/fixtures/empty-box/packing-sealed.jpg"]);
  });
});
