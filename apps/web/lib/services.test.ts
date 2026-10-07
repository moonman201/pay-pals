import { describe, expect, it } from "vitest";
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
    expect(Object.keys(seeded).sort()).toEqual(["clean-garmin", "scam-garmin", "wrong-item"]);

    const scam = await loadSnapshot(services, seeded["scam-garmin"]!);
    expect(scam.deal.state).toBe("BLOCKED");
    expect(scam.verdict?.overall).toBe("stop");

    const clean = await loadSnapshot(services, seeded["clean-garmin"]!);
    expect(clean.deal.state).toBe("COMPLETE");
    expect(clean.cards).toHaveLength(2);
    expect(clean.lockedCard?.version).toBe(2);
    expect(clean.payment?.status).toBe("CAPTURED");
    expect(clean.shipment?.deliveredAt).not.toBeNull();
    expect(clean.arrivalCheck?.matches).toBe(true);

    const wrong = await loadSnapshot(services, seeded["wrong-item"]!);
    expect(wrong.deal.state).toBe("ISSUE");
    expect(wrong.arrivalCheck?.matches).toBe(false);
    expect(wrong.hasEvidence).toBe(true);
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

  it("keeps secrets out of the startup log when keys are present", () => {
    const lines: string[] = [];
    createServices({ PAYPAL_CLIENT_ID: "id-secret-value", PAYPAL_CLIENT_SECRET: "shh-secret-value", PAYPAL_ENV: "sandbox", CHANNEL3_API_KEY: "c3-secret-value" }, (l) => lines.push(l));
    const log = lines.join("\n");
    expect(log).toMatch(/sandbox gateway/);
    expect(log).toMatch(/Channel3/);
    expect(log).not.toMatch(/secret-value/);
  });
});
