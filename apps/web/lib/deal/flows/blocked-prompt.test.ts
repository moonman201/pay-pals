/** On a blocked deal the Seller Pal must not point at an add control the room does not show. */
import { describe, expect, it } from "vitest";
import { createServices } from "../../services";
import { runReview } from "./review";
import { startDemoDeal } from "./start";

async function sellerPalLines(scenario: "fake-slab" | "clean-ps5") {
  const services = createServices({}, () => {});
  await services.ready;
  const deal = await startDemoDeal(services, scenario);
  await runReview(services, deal.id);
  const state = (await services.store.getDeal(deal.id))!.state;
  const chat = await services.store.listMessages(deal.id, "seller_pal");
  return { state, lines: chat.filter((m) => m.author === "seller_pal").map((m) => m.text) };
}

describe("the Seller Pal's prompt after a review", () => {
  it("blocked slab: says the card cannot change, and does not say add it below", async () => {
    const { state, lines } = await sellerPalLines("fake-slab");
    expect(state).toBe("BLOCKED");
    const asked = lines.find((l) => l.startsWith("The buyer's pal asked"));
    expect(asked).toBeDefined();
    expect(asked).toContain("The deal is blocked, so the card cannot change.");
    expect(lines.join(" ")).not.toContain("Add it below");
  });

  it("an open deal still tells the seller where to add it", async () => {
    const { lines } = await sellerPalLines("clean-ps5");
    expect(lines.find((l) => l.startsWith("The buyer's pal asked"))).toContain("Add it below and I will save a new card version.");
  });
});
