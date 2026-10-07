import { cleanPs5 } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { startDemoDeal } from "./deal/flows/start";
import { loadSnapshot } from "./deal/snapshot";
import { createServices } from "./services";

describe("createServices with no keys", () => {
  it("picks the memory store, rules-only pals, fixture prices and the mock gateway, and says so without values", () => {
    const lines: string[] = [];
    const services = createServices({}, (l) => lines.push(l));
    expect(services.modes).toEqual({ store: "memory", claude: false, prices: "fixture", paypal: "mock" });
    expect(lines.join("\n")).toMatch(/rules only/);
    expect(lines.join("\n")).toMatch(/fixture ranges/);
    expect(lines.join("\n")).toMatch(/mock gateway/);
    expect(lines.join("\n")).toMatch(/in memory/);
  });

  it("seeds the three finished demo deals in their end states", async () => {
    const services = createServices({}, () => {});
    const seeded = await services.seededDeals;
    expect(Object.keys(seeded).sort()).toEqual(["clean-ps5", "empty-box", "scam-ps5"]);

    const scam = await loadSnapshot(services, seeded["scam-ps5"]!);
    expect(scam.deal.state).toBe("BLOCKED");
    expect(scam.verdict?.overall).toBe("stop");

    const clean = await loadSnapshot(services, seeded["clean-ps5"]!);
    expect(clean.deal.state).toBe("COMPLETE");
    expect(clean.cards).toHaveLength(2);
    expect(clean.lockedCard?.version).toBe(2);
    expect(clean.payment?.status).toBe("CAPTURED");
    expect(clean.shipment?.deliveredAt).not.toBeNull();
    expect(clean.arrivalCheck?.matches).toBe(true);

    const empty = await loadSnapshot(services, seeded["empty-box"]!);
    expect(empty.deal.state).toBe("ISSUE");
    expect(empty.arrivalCheck?.matches).toBe(false);
    expect(empty.hasEvidence).toBe(true);
  });

  it("PAY_PALS_DEMO_ONLY forces demo modes even when every key is present", () => {
    const keys = {
      DATABASE_URL: "postgres://user:pw@db.example/paypals",
      ANTHROPIC_API_KEY: "sk-ant-secret-value",
      CHANNEL3_API_KEY: "c3-secret-value",
      PAYPAL_ENV: "sandbox",
      PAYPAL_CLIENT_ID: "id-secret-value",
      PAYPAL_CLIENT_SECRET: "shh-secret-value",
    };
    for (const flag of ["1", "true", "TRUE"]) {
      const lines: string[] = [];
      const services = createServices({ ...keys, PAY_PALS_DEMO_ONLY: flag }, (l) => lines.push(l));
      expect(services.modes).toEqual({ store: "memory", claude: false, prices: "fixture", paypal: "mock" });
      expect(lines[0]).toMatch(/demo-only mode is on/);
      expect(lines.join("\n")).not.toMatch(/secret-value/);
    }
    // "0" does not force demo mode. Only the PayPal keys here: a real Claude client or Postgres pool has no place in a unit test.
    const off = createServices({ PAYPAL_ENV: "sandbox", PAYPAL_CLIENT_ID: "id-secret-value", PAYPAL_CLIENT_SECRET: "shh-secret-value", PAY_PALS_DEMO_ONLY: "0" }, () => {});
    expect(off.modes).toEqual({ store: "memory", claude: false, prices: "fixture", paypal: "sandbox" });
  });

  it("substitutes the sandbox seller for the fixture payee on demo deals, without logging the address", async () => {
    const lines: string[] = [];
    const sandboxSeller = "sb-seller-personal@example.com";
    const services = createServices({ SANDBOX_SELLER_PERSONAL_EMAIL: sandboxSeller }, (l) => lines.push(l));
    expect(services.demoPayee).toBe(sandboxSeller);
    expect(lines.join("\n")).toMatch(/demo payee: sandbox seller account/);
    expect(lines.join("\n")).not.toContain(sandboxSeller);

    const seeded = await services.seededDeals;
    const clean = await loadSnapshot(services, seeded["clean-ps5"]!);
    expect(clean.lockedCard?.sellerPaypalEmail).toBe(sandboxSeller);
    expect(clean.cards.every((c) => c.sellerPaypalEmail === sandboxSeller)).toBe(true);
    expect(clean.payment?.payeeEmail).toBe(sandboxSeller);

    const fresh = await startDemoDeal(services, "empty-box");
    const card = await services.store.getCurrentCard(fresh.id);
    expect(card?.sellerPaypalEmail).toBe(sandboxSeller);

    // The fixture file itself is untouched.
    expect(cleanPs5.cards[0]?.sellerPaypalEmail).not.toBe(sandboxSeller);
    expect(createServices({}, () => {}).demoPayee).toBeNull();
  });

  it("keeps secrets out of the startup log when keys are present", () => {
    const lines: string[] = [];
    createServices({ PAYPAL_CLIENT_ID: "id-secret-value", PAYPAL_CLIENT_SECRET: "shh-secret-value", PAYPAL_ENV: "sandbox", CHANNEL3_API_KEY: "c3-secret-value" }, (l) => lines.push(l));
    const log = lines.join("\n");
    expect(log).toMatch(/sandbox gateway/);
    expect(log).toMatch(/Channel3/);
    expect(log).not.toMatch(/secret-value/);
  });
});
