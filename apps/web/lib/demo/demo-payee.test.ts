import { cleanPs5, emptyBox, fakeSlab } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { demoPayeeFor, demoPayeesFromEnv } from "./demo-payee";
import { createServices } from "../services";
import { startDemoDeal } from "../deal/flows/start";

const KEYS = {
  SANDBOX_SELLER_PERSONAL_EMAIL: "shared@example.com",
  SANDBOX_SELLER_EMAIL_CLEAN_PS5: "matt.sandbox@example.com",
  SANDBOX_SELLER_EMAIL_EMPTY_BOX: "marcus.sandbox@example.com",
};

describe("demoPayeeFor", () => {
  it("gives each scenario its own account", () => {
    const payees = demoPayeesFromEnv(KEYS);
    expect(demoPayeeFor(payees, "clean-ps5")).toBe(KEYS.SANDBOX_SELLER_EMAIL_CLEAN_PS5);
    expect(demoPayeeFor(payees, "empty-box")).toBe(KEYS.SANDBOX_SELLER_EMAIL_EMPTY_BOX);
  });

  it("falls back to the shared account for a scenario with no key of its own", () => {
    const payees = demoPayeesFromEnv({ SANDBOX_SELLER_PERSONAL_EMAIL: KEYS.SANDBOX_SELLER_PERSONAL_EMAIL, SANDBOX_SELLER_EMAIL_CLEAN_PS5: "matt.sandbox@example.com" });
    expect(demoPayeeFor(payees, "clean-ps5")).toBe("matt.sandbox@example.com");
    expect(demoPayeeFor(payees, "empty-box")).toBe(KEYS.SANDBOX_SELLER_PERSONAL_EMAIL);
  });

  it("keeps the fixture payee when nothing is set", () => {
    expect(demoPayeeFor(demoPayeesFromEnv({}), "clean-ps5")).toBeNull();
    expect(demoPayeeFor(null, "empty-box")).toBeNull();
  });

  it("never replaces fake-slab's address with every key set", async () => {
    expect(demoPayeeFor(demoPayeesFromEnv(KEYS), "fake-slab")).toBeNull();
    const services = createServices(KEYS, () => {});
    const deal = await startDemoDeal(services, "fake-slab");
    const card = await services.store.getCurrentCard(deal.id);
    expect(card?.sellerPaypalEmail).toBe(fakeSlab.cards[0]!.sellerPaypalEmail);
    const seeded = await services.seededDeals;
    const slab = await services.store.getCurrentCard(seeded["fake-slab"]!);
    expect(slab?.sellerPaypalEmail).toBe(fakeSlab.cards[0]!.sellerPaypalEmail);
  });

  it("starts clean-ps5 and empty-box deals on different accounts", async () => {
    const services = createServices(KEYS, () => {});
    const a = await startDemoDeal(services, "clean-ps5");
    const b = await startDemoDeal(services, "empty-box");
    expect((await services.store.getCurrentCard(a.id))?.sellerPaypalEmail).toBe(KEYS.SANDBOX_SELLER_EMAIL_CLEAN_PS5);
    expect((await services.store.getCurrentCard(b.id))?.sellerPaypalEmail).toBe(KEYS.SANDBOX_SELLER_EMAIL_EMPTY_BOX);
    expect(cleanPs5.cards[0]!.sellerPaypalEmail).not.toBe(KEYS.SANDBOX_SELLER_EMAIL_CLEAN_PS5);
    expect(emptyBox.cards[0]!.sellerPaypalEmail).not.toBe(KEYS.SANDBOX_SELLER_EMAIL_EMPTY_BOX);
  });
});
