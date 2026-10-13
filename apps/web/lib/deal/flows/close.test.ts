/** Cancelling, driven through the real flow on the in-memory store with no keys. */
import { describe, expect, it } from "vitest";
import { seedFixtureDeals } from "../../demo/seed-fixtures";
import { createServices } from "../../services";
import { FlowError } from "../errors";
import { CANCELLED_AFTER_STOP_SELLER_LINE, CANCELLED_AFTER_STOP_SUMMARY, cancelDeal, EXAMPLE_NOT_CANCELLABLE } from "./close";
import { runReview } from "./review";
import { startDemoDeal } from "./start";

const noKeys = () => createServices({}, () => {});

/** The slab, which the Buyer Pal blocks on a payment-method flag. */
async function blockedSlab(services: ReturnType<typeof noKeys>): Promise<string> {
  const deal = await startDemoDeal(services, "fake-slab");
  await runReview(services, deal.id);
  expect((await services.store.getDeal(deal.id))!.state).toBe("BLOCKED");
  return deal.id;
}

describe("cancelDeal on a blocked deal", () => {
  it("records 'Buyer cancelled after a stop.' and tells the seller on their own channel", async () => {
    const services = noKeys();
    const dealId = await blockedSlab(services);

    const after = await cancelDeal(services, dealId, "buyer");
    expect(after.state).toBe("CANCELLED");

    const events = await services.store.listEvents(dealId);
    const change = events.filter((e) => e.kind === "state_changed").at(-1)!;
    expect(change.summary).toBe(CANCELLED_AFTER_STOP_SUMMARY);
    const seller = (await services.store.listMessages(dealId, "seller_pal")).at(-1)!;
    expect(seller.text).toBe(CANCELLED_AFTER_STOP_SELLER_LINE);
    expect(seller.author).toBe("seller_pal");
  });

  it("refuses the seller", async () => {
    const services = noKeys();
    const dealId = await blockedSlab(services);
    const error = await cancelDeal(services, dealId, "seller").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FlowError);
    expect((error as FlowError).status).toBe(403);
    expect((await services.store.getDeal(dealId))!.state).toBe("BLOCKED");
  });
});

describe("cancelDeal elsewhere", () => {
  it("keeps the plain summary for a deal that was not blocked", async () => {
    const services = noKeys();
    const deal = await startDemoDeal(services, "clean-ps5");
    await cancelDeal(services, deal.id, "buyer");
    const change = (await services.store.listEvents(deal.id)).filter((e) => e.kind === "state_changed").at(-1)!;
    expect(change.summary).toBe("Cancelled by the buyer.");
  });
});

describe("cancelDeal on a seeded example deal", () => {
  it("refuses, so a visitor cannot cancel the finished slab the landing page shows", async () => {
    const services = noKeys();
    const ids = await seedFixtureDeals({ store: services.store, buyerPal: services.buyerPal, buildEvidencePack: services.buildEvidencePack, demoPayee: null, clock: () => new Date() }, () => {});
    const slab = ids["fake-slab"]!;
    expect((await services.store.getDeal(slab))!.state).toBe("BLOCKED");

    const error = await cancelDeal(services, slab, "buyer").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FlowError);
    expect((error as FlowError).message).toBe(EXAMPLE_NOT_CANCELLABLE);
    expect((await services.store.getDeal(slab))!.state).toBe("BLOCKED");
  });
});
