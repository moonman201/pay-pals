import { describe, expect, it } from "vitest";
import { runDealStoreConformance } from "../conformance/deal-store.conformance";
import { createMemoryDealStore } from "./memory-store";
import { getFixture } from "@pay-pals/contracts";

runDealStoreConformance("memory", async () => createMemoryDealStore());

describe("memory store", () => {
  it("hands out copies, not references", async () => {
    const store = createMemoryDealStore();
    const fx = getFixture("clean-ps5");
    const deal = await store.createDeal({ seller: fx.seller });
    const card = await store.saveCard({ ...fx.cards[0]!, dealId: deal.id, version: 1, lockedAt: null });
    card.title = "changed by caller";
    expect((await store.getCard(deal.id, 1))?.title).toBe(fx.cards[0]!.title);
  });
});
