import { cleanPs5 } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { outcomeOf } from "./deal/arrival-outcome";
import { startDemoDeal } from "./deal/flows/start";
import { loadSnapshot, sandboxBuyerFor } from "./deal/snapshot";
import { createServices } from "./services";

describe("createServices with no keys", () => {
  it("picks the memory store, rules-only pals, fixture prices and the mock gateway, and says so without values", () => {
    const lines: string[] = [];
    const services = createServices({}, (l) => lines.push(l));
    expect(services.modes).toEqual({ store: "memory", claude: false, prices: "fixture", certs: "fixture", paypal: "mock" });
    expect(lines.join("\n")).toMatch(/fixture cert records/);
    expect(lines.join("\n")).toMatch(/rules only/);
    expect(lines.join("\n")).toMatch(/fixture ranges/);
    expect(lines.join("\n")).toMatch(/mock gateway/);
    expect(lines.join("\n")).toMatch(/in memory/);
  });

  it("seeds the three finished demo deals in their end states", async () => {
    const services = createServices({}, () => {});
    const seeded = await services.seededDeals;
    expect(Object.keys(seeded).sort()).toEqual(["clean-ps5", "empty-box", "fake-slab"]);

    const scam = await loadSnapshot(services, seeded["fake-slab"]!);
    expect(scam.deal.state).toBe("BLOCKED");
    expect(scam.verdict?.overall).toBe("stop");

    const clean = await loadSnapshot(services, seeded["clean-ps5"]!);
    expect(clean.deal.state).toBe("COMPLETE");
    expect(clean.cards).toHaveLength(2);
    expect(clean.lockedCard?.version).toBe(2);
    expect(clean.payment?.status).toBe("CAPTURED");
    expect(clean.shipment?.deliveredAt).not.toBeNull();
    expect(outcomeOf(clean.arrivalCheck!)).toBe("match");

    const empty = await loadSnapshot(services, seeded["empty-box"]!);
    expect(empty.deal.state).toBe("ISSUE");
    expect(outcomeOf(empty.arrivalCheck!)).toBe("mismatch");
    expect(empty.hasEvidence).toBe(true);
  });

  it("PAY_PALS_DEMO_ONLY forces demo modes even when every key is present", () => {
    const keys = {
      DATABASE_URL: "postgres://user:pw@db.example/paypals",
      ANTHROPIC_API_KEY: "sk-ant-secret-value",
      CHANNEL3_API_KEY: "c3-secret-value",
      PSA_API_TOKEN: "psa-secret-value",
      PAYPAL_ENV: "sandbox",
      PAYPAL_CLIENT_ID: "id-secret-value",
      PAYPAL_CLIENT_SECRET: "shh-secret-value",
    };
    for (const flag of ["1", "true", "TRUE"]) {
      const lines: string[] = [];
      const services = createServices({ ...keys, PAY_PALS_DEMO_ONLY: flag }, (l) => lines.push(l));
      expect(services.modes).toEqual({ store: "memory", claude: false, prices: "fixture", certs: "fixture", paypal: "mock" });
      expect(lines[0]).toMatch(/demo-only mode is on/);
      expect(lines.join("\n")).not.toMatch(/secret-value/);
    }
    // "0" does not force demo mode. Only the PayPal keys here: a real Claude client or Postgres pool has no place in a unit test.
    const off = createServices({ PAYPAL_ENV: "sandbox", PAYPAL_CLIENT_ID: "id-secret-value", PAYPAL_CLIENT_SECRET: "shh-secret-value", PAY_PALS_DEMO_ONLY: "0" }, () => {});
    expect(off.modes).toEqual({ store: "memory", claude: false, prices: "fixture", certs: "fixture", paypal: "sandbox" });
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

  it("keeps the fixture payee in demo-only mode, so an .env.local on disk cannot change what the pages render", async () => {
    const lines: string[] = [];
    const sandboxSeller = "sb-seller-personal@example.com";
    const env = {
      PAY_PALS_DEMO_ONLY: "1",
      SANDBOX_SELLER_PERSONAL_EMAIL: sandboxSeller,
      PAYPAL_ENV: "sandbox",
      PAYPAL_CLIENT_ID: "id-secret-value",
      PAYPAL_CLIENT_SECRET: "shh-secret-value",
    };
    const services = createServices(env, (l) => lines.push(l));
    expect(services.demoPayee).toBeNull();
    expect(lines.join("\n")).toMatch(/demo payee: fixture payee kept/);
    expect(lines.join("\n")).not.toContain(sandboxSeller);

    const seeded = await services.seededDeals;
    const clean = await loadSnapshot(services, seeded["clean-ps5"]!);
    expect(clean.lockedCard?.sellerPaypalEmail).toBe(cleanPs5.cards[0]!.sellerPaypalEmail);
    expect(clean.payment?.payeeEmail).toBe(cleanPs5.payment!.payeeEmail);

    const fresh = await startDemoDeal(services, "clean-ps5");
    const card = await services.store.getCurrentCard(fresh.id);
    expect(card?.sellerPaypalEmail).toBe(cleanPs5.cards[0]!.sellerPaypalEmail);
  });

  it("still substitutes the sandbox seller in sandbox mode with the same env present", () => {
    const sandboxSeller = "sb-seller-personal@example.com";
    const sandbox = createServices(
      { SANDBOX_SELLER_PERSONAL_EMAIL: sandboxSeller, PAYPAL_ENV: "sandbox", PAYPAL_CLIENT_ID: "id-secret-value", PAYPAL_CLIENT_SECRET: "shh-secret-value" },
      () => {},
    );
    expect(sandbox.modes.paypal).toBe("sandbox");
    expect(sandbox.demoPayee).toBe(sandboxSeller);
  });

  it("tells the pals about the known photos and the photo base URL without printing it", () => {
    const lines: string[] = [];
    createServices({ NEXT_PUBLIC_APP_URL: "https://pay-pals-secret-host.example" }, (l) => lines.push(l));
    const log = lines.join("\n");
    expect(log).toMatch(/photos: \d+ known photos for the reused-photo check, base URL configured/);
    expect(log).not.toContain("pay-pals-secret-host");
    const noBase: string[] = [];
    createServices({}, (l) => noBase.push(l));
    expect(noBase.join("\n")).toMatch(/base URL from each request/);
  });

  it("serves the sandbox test buyer only for demo deals on the sandbox gateway, and never logs the values", async () => {
    const creds = { SANDBOX_BUYER_EMAIL: "sb-buyer@personal.example.com", SANDBOX_BUYER_PASSWORD: "sandbox-pass-123" };
    const lines: string[] = [];
    const sandbox = createServices({ PAYPAL_ENV: "sandbox", PAYPAL_CLIENT_ID: "id-secret-value", PAYPAL_CLIENT_SECRET: "shh-secret-value", ...creds }, (l) => lines.push(l));
    expect(sandbox.sandboxBuyer).toEqual({ email: creds.SANDBOX_BUYER_EMAIL, password: creds.SANDBOX_BUYER_PASSWORD });
    expect(lines.join("\n")).toMatch(/sandbox buyer: test account available/);
    expect(lines.join("\n")).not.toContain("sb-buyer");
    expect(lines.join("\n")).not.toContain("sandbox-pass");
    const demoDeal = { ...cleanPs5.deal, scenario: "clean-ps5" as const };
    const realDeal = { ...cleanPs5.deal, scenario: null };
    expect(sandboxBuyerFor(demoDeal, sandbox)).toEqual(sandbox.sandboxBuyer);
    expect(sandboxBuyerFor(realDeal, sandbox)).toBeNull();

    const mock = createServices({ ...creds }, () => {});
    expect(mock.sandboxBuyer).toBeNull();
    expect(sandboxBuyerFor(demoDeal, mock)).toBeNull();
    const demoOnly = createServices({ PAYPAL_ENV: "sandbox", PAYPAL_CLIENT_ID: "id-secret-value", PAYPAL_CLIENT_SECRET: "shh-secret-value", ...creds, PAY_PALS_DEMO_ONLY: "1" }, () => {});
    expect(demoOnly.sandboxBuyer).toBeNull();
    const snap = await loadSnapshot(mock, (await mock.seededDeals)["clean-ps5"]!);
    expect(snap.sandboxBuyer).toBeNull();
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

describe("createServices and seeding", () => {
  it("never seeds a Postgres store at start, so a visitor's first request does not wait on a replay", async () => {
    const lines: string[] = [];
    // Nothing listens on port 1: the migration fails fast and is logged, and no seeding is attempted either way.
    const services = createServices({ DATABASE_URL: "postgres://nobody@127.0.0.1:1/none" }, (l) => lines.push(l));
    expect(services.modes.store).toBe("postgres");
    expect(await services.seededDeals).toEqual({});
    await services.ready;
    expect(lines.join("\n")).toMatch(/not seeded at start/);
  });

  it("seeds the in-memory store without a model call, even with an Anthropic key set", async () => {
    const calls: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      throw new Error("no network in this test");
    }) as typeof fetch;
    try {
      const started = Date.now();
      const services = createServices({ ANTHROPIC_API_KEY: "test-key-not-real" }, () => {});
      const seeded = await services.seededDeals;
      expect(Object.keys(seeded).sort()).toEqual(["clean-ps5", "empty-box", "fake-slab"]);
      expect(Date.now() - started).toBeLessThan(5000);
      expect(calls.filter((u) => /anthropic/i.test(u))).toEqual([]);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
