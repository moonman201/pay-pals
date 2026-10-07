import { IllegalTransitionError, cleanGarmin } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { createMemoryDealStore } from "./memory-store";

const seller = cleanGarmin.seller;
const buyer = cleanGarmin.buyer;

describe("MemoryDealStore", () => {
  it("creates a deal in DRAFT and follows the transition table", async () => {
    const store = createMemoryDealStore();
    const deal = await store.createDeal({ seller, buyer, scenario: "clean-garmin" });
    expect(deal.state).toBe("DRAFT");
    await store.transition(deal.id, "LISTED", "system", "Listed.");
    await expect(store.transition(deal.id, "PAID", "system", "nope")).rejects.toBeInstanceOf(IllegalTransitionError);
    const events = await store.listEvents(deal.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "state_changed", fromState: "DRAFT", toState: "LISTED" });
  });

  it("keeps card versions and refuses changes after the lock", async () => {
    const store = createMemoryDealStore();
    const deal = await store.createDeal({ seller, buyer });
    const [v1, v2] = cleanGarmin.cards;
    if (!v1 || !v2) throw new Error("fixture missing cards");
    await store.saveCard({ ...v1, dealId: deal.id });
    await store.saveCard({ ...v2, dealId: deal.id, lockedAt: null });
    expect((await store.listCards(deal.id)).map((c) => c.version)).toEqual([1, 2]);
    expect((await store.getCurrentCard(deal.id))?.version).toBe(2);

    const locked = await store.lockCard(deal.id, 2);
    expect(locked.lockedAt).not.toBeNull();
    expect((await store.getDeal(deal.id))?.lockedCardVersion).toBe(2);
    await expect(store.saveCard({ ...v2, dealId: deal.id, version: 3, lockedAt: null })).rejects.toThrow(/locked/);
  });

  it("filters messages by channel", async () => {
    const store = createMemoryDealStore();
    const deal = await store.createDeal({ seller, buyer });
    await store.addMessage({ dealId: deal.id, channel: "deal", author: "buyer", text: "hi", photos: [], at: new Date().toISOString() });
    await store.addMessage({ dealId: deal.id, channel: "buyer_pal", author: "buyer_pal", text: "private", photos: [], at: new Date().toISOString() });
    expect(await store.listMessages(deal.id)).toHaveLength(2);
    expect(await store.listMessages(deal.id, "buyer_pal")).toHaveLength(1);
  });
});
