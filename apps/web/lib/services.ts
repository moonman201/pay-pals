/**
 * The service seam. This is the only file that decides which implementation
 * of each contract interface the app uses, and the only production file that
 * may import from lib/mocks. Everything else calls getServices().
 *
 * Choices, each logged once at startup (never a value):
 *   store   DATABASE_URL set      -> Postgres (migrated through `ready`)
 *           otherwise             -> in-memory, seeded with the three demo deals
 *   pals    always the real @pay-pals/agents; without ANTHROPIC_API_KEY they run rules only
 *   prices  CHANNEL3_API_KEY set  -> Channel3, otherwise the fixture ranges
 *   paypal  PAYPAL_CLIENT_ID set  -> sandbox gateway, otherwise a mock that never leaves the process
 */
import {
  createAnthropicClientFromEnv,
  createBuyerPal,
  createChannel3PriceLookup,
  createEvidencePackBuilder,
  createFixturePriceLookup,
  createSellerPal,
} from "@pay-pals/agents";
import type { BuyerPal, EvidencePackBuilder, PayPalGateway, PayPalsStore, ScenarioId, SellerPal, WebhookEvent } from "@pay-pals/contracts";
import { createMemoryDealStore, createPostgresDealStore } from "@pay-pals/db";
import { createPayPalGateway, handleWebhookEvent, loadPayPalConfig, type WebhookOutcome } from "@pay-pals/paypal";
import { asDealFinder, seedFixtureDeals, seedFixtureDealsIfMissing } from "./demo/seed-fixtures";
import { loadRootEnvLocal } from "./env";
import { createMockPayPalGateway } from "./mocks/paypal-gateway";

export interface ServiceModes {
  store: "postgres" | "memory";
  claude: boolean;
  prices: "channel3" | "fixture";
  paypal: "sandbox" | "mock";
}

export interface Services {
  store: PayPalsStore;
  sellerPal: SellerPal;
  buyerPal: BuyerPal;
  paypal: PayPalGateway;
  buildEvidencePack: EvidencePackBuilder;
  /** Verified PayPal webhook events go here. */
  handleWebhook: (event: WebhookEvent) => Promise<WebhookOutcome>;
  modes: ServiceModes;
  /**
   * Payee used for deals started from demo mode, from SANDBOX_SELLER_PERSONAL_EMAIL.
   * Fixture payees have no sandbox account, so a capture to them never moves a balance.
   */
  demoPayee: string | null;
  /** Resolves once migration (Postgres) or seeding (memory) has finished. */
  ready: Promise<void>;
  /** Finished demo deals seeded into the memory store, scenario id to deal id. Empty on Postgres. */
  seededDeals: Promise<Partial<Record<ScenarioId, string>>>;
}

type Env = Record<string, string | undefined>;
type Log = (line: string) => void;

const has = (env: Env, key: string) => Boolean(env[key]?.trim());

/**
 * PAY_PALS_DEMO_ONLY=1 (or true) is a test knob: memory store, rules-only
 * pals, fixture prices and the mock gateway no matter which keys are
 * present, so an e2e run never calls Claude or the PayPal sandbox.
 */
export function isDemoOnly(env: Env): boolean {
  const value = env.PAY_PALS_DEMO_ONLY?.trim().toLowerCase();
  return value === "1" || value === "true";
}

const DEMO_ONLY_MODES: ServiceModes = { store: "memory", claude: false, prices: "fixture", paypal: "mock" };

export function createServices(env: Env = process.env, log: Log = (line) => console.info(line), demoOnly = isDemoOnly(env)): Services {
  if (demoOnly) log("[pay-pals] demo-only mode is on (PAY_PALS_DEMO_ONLY): keys in the environment are ignored");
  const modes: ServiceModes = demoOnly
    ? DEMO_ONLY_MODES
    : {
        store: has(env, "DATABASE_URL") ? "postgres" : "memory",
        claude: has(env, "ANTHROPIC_API_KEY"),
        prices: has(env, "CHANNEL3_API_KEY") ? "channel3" : "fixture",
        paypal: has(env, "PAYPAL_CLIENT_ID") && has(env, "PAYPAL_CLIENT_SECRET") ? "sandbox" : "mock",
      };

  const anthropic = modes.claude ? createAnthropicClientFromEnv() : null;
  const priceLookup = modes.prices === "channel3" ? createChannel3PriceLookup(env.CHANNEL3_API_KEY!.trim()) : createFixturePriceLookup();
  const sellerPal = createSellerPal({ anthropic });
  const buyerPal = createBuyerPal({ anthropic, priceLookup });
  const buildEvidencePack = createEvidencePackBuilder({ anthropic });
  const paypal = modes.paypal === "sandbox" ? createPayPalGateway(loadPayPalConfig(env)) : createMockPayPalGateway();

  log(`[pay-pals] pals: real Seller Pal and Buyer Pal, ${modes.claude ? "Claude on" : "rules only (ANTHROPIC_API_KEY not set)"}`);
  log(`[pay-pals] prices: ${modes.prices === "channel3" ? "Channel3" : "fixture ranges (CHANNEL3_API_KEY not set)"}`);
  log(`[pay-pals] paypal: ${modes.paypal === "sandbox" ? "sandbox gateway" : "mock gateway, no network (PAYPAL_CLIENT_ID not set)"}`);

  const demoPayee = env.SANDBOX_SELLER_PERSONAL_EMAIL?.trim() || null;
  if (demoPayee) log("[pay-pals] demo payee: sandbox seller account (SANDBOX_SELLER_PERSONAL_EMAIL) replaces the fixture payee on demo deals");

  let store: PayPalsStore;
  let ready: Promise<void>;
  let seededDeals: Promise<Partial<Record<ScenarioId, string>>>;
  const services = { sellerPal, buyerPal, buildEvidencePack, paypal, demoPayee } as Services;

  if (modes.store === "postgres") {
    const pg = createPostgresDealStore(env.DATABASE_URL!.trim());
    store = pg;
    services.store = store;
    log("[pay-pals] store: Postgres (DATABASE_URL set)");
    const migrated = pg.migrate().catch((error: unknown) => {
      log(`[pay-pals] store: migration did not run (${error instanceof Error ? error.message : String(error)}). Run: npm run migrate -w packages/db`);
    });
    const finder = asDealFinder(pg);
    seededDeals = migrated.then(() => {
      if (finder) return seedFixtureDealsIfMissing(services, finder, log);
      log("[pay-pals] demo: finished demo deals are off on this store; it has no findDeals(scenario, states) to seed idempotently");
      return {};
    });
    ready = seededDeals.then(() => undefined);
  } else {
    store = createMemoryDealStore();
    log("[pay-pals] store: in memory (DATABASE_URL not set), demo deals live until the process restarts");
    services.store = store;
    seededDeals = seedFixtureDeals(services, log);
    ready = seededDeals.then(() => undefined);
  }

  services.store = store;
  services.handleWebhook = (event) => handleWebhookEvent(event, store);
  services.modes = modes;
  services.ready = ready;
  services.seededDeals = seededDeals;
  return services;
}

const globalRef = globalThis as typeof globalThis & { __payPalsServices?: Services };

/** One instance per server process. Kept on globalThis so dev hot reloads do not lose demo deals. */
export function getServices(): Services {
  if (!globalRef.__payPalsServices) {
    // Read the test knob from the real environment first, so a .env.local file cannot turn it off.
    const demoOnly = isDemoOnly(process.env);
    loadRootEnvLocal();
    globalRef.__payPalsServices = createServices(process.env, undefined, demoOnly);
  }
  return globalRef.__payPalsServices;
}
