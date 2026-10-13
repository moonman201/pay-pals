/**
 * The service seam. This is the only file that decides which implementation
 * of each contract interface the app uses, and the only production file that
 * may import from lib/mocks. Everything else calls getServices().
 *
 * Choices, each logged once at startup (never a value):
 *   store   DATABASE_URL set      -> Postgres (migrated through `ready`)
 *           otherwise             -> in-memory, seeded with the three demo deals (rules-only, no model call)
 *   Postgres is never seeded here: a visitor's request must not wait on a replay. `npm run demo:seed -w apps/web` does it after a deploy.
 *   pals    always the real @pay-pals/agents; without ANTHROPIC_API_KEY they run rules only
 *   prices  CHANNEL3_API_KEY set  -> Channel3, otherwise the fixture ranges
 *   paypal  PAYPAL_CLIENT_ID set  -> sandbox gateway, otherwise a mock that never leaves the process
 */
import {
  createAnthropicClientFromEnv,
  createBuyerPal,
  createChannel3PriceLookup,
  createEvidencePackBuilder,
  createFixtureCertLookup,
  createFixturePriceLookup,
  createPsaCertLookup,
  createSellerPal,
} from "@pay-pals/agents";
import type { BuyerPal, EvidencePackBuilder, PayPalGateway, PayPalsStore, ScenarioId, SellerPal, WebhookEvent } from "@pay-pals/contracts";
import { createMemoryDealStore, createPostgresDealStore, createReplayClock, systemClock } from "@pay-pals/db";
import { createPayPalGateway, handleWebhookEvent, loadPayPalConfig, type PayPalsGateway, type WebhookOutcome } from "@pay-pals/paypal";
import path from "node:path";
import { photoBase } from "./deal/photo-urls";
import { buildKnownPhotos, localAwareFetcher } from "./demo/known-photos";
import { seedFixtureDeals } from "./demo/seed-fixtures";
import { loadRootEnvLocal } from "./env";
import { isPublicMode, publicModeLine } from "./public-mode";
import { detectUploadsEnabled } from "./uploads";
import { createMockPayPalGateway } from "./mocks/paypal-gateway";
import { demoPayeesFromEnv, type DemoPayees } from "./demo/demo-payee";

/**
 * The contract gateway plus getOrder, the live read the payment panel needs
 * so "Confirmed by PayPal" can sit over PayPal's own values. Narrowed from
 * PayPalsGateway on purpose: the mock has no low-level http handle and does
 * not need one.
 */
export type PayPalService = PayPalGateway & Pick<PayPalsGateway, "getOrder">;

export interface ServiceModes {
  store: "postgres" | "memory";
  claude: boolean;
  prices: "channel3" | "fixture";
  certs: "psa" | "fixture";
  paypal: "sandbox" | "mock";
}

export interface Services {
  store: PayPalsStore;
  sellerPal: SellerPal;
  buyerPal: BuyerPal;
  paypal: PayPalService;
  buildEvidencePack: EvidencePackBuilder;
  /** Verified PayPal webhook events go here. */
  handleWebhook: (event: WebhookEvent) => Promise<WebhookOutcome>;
  /** The clock events and messages are stamped with. Wall time for live deals; the seeder replays fixtures on their own dates. */
  clock: () => Date;
  /** Photo uploads work on this host (public/uploads is writable). Hosted builds are read-only. */
  uploadsEnabled: boolean;
  /**
   * The PayPal sandbox test buyer, for demo deals paid through the sandbox
   * gateway. Server-side only; the pay panel shows it so a judge can approve.
   * Null without both SANDBOX_BUYER_EMAIL and SANDBOX_BUYER_PASSWORD, or on the mock gateway.
   */
  sandboxBuyer: { email: string; password: string } | null;
  modes: ServiceModes;
  /**
   * Payees used for deals started from demo mode, per scenario (see lib/demo/demo-payee.ts):
   * SANDBOX_SELLER_EMAIL_CLEAN_PS5 and SANDBOX_SELLER_EMAIL_EMPTY_BOX, each falling back to
   * SANDBOX_SELLER_PERSONAL_EMAIL. fake-slab is never in it.
   * Fixture payees have no sandbox account, so a capture to them never moves a balance.
   * Null in demo-only mode, which keeps the fixture payee so the pages render the
   * same everywhere.
   */
  demoPayee: DemoPayees | null;
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
 * pals, fixture prices, the mock gateway and the fixture payee no matter
 * which keys are present, so an e2e run never calls Claude or the PayPal
 * sandbox and renders the same page on every machine.
 */
export function isDemoOnly(env: Env): boolean {
  const value = env.PAY_PALS_DEMO_ONLY?.trim().toLowerCase();
  return value === "1" || value === "true";
}

const DEMO_ONLY_MODES: ServiceModes = { store: "memory", claude: false, prices: "fixture", certs: "fixture", paypal: "mock" };

export function createServices(env: Env = process.env, log: Log = (line) => console.info(line), demoOnly = isDemoOnly(env)): Services {
  if (demoOnly) log("[pay-pals] demo-only mode is on (PAY_PALS_DEMO_ONLY): keys in the environment are ignored");
  const modes: ServiceModes = demoOnly
    ? DEMO_ONLY_MODES
    : {
        store: has(env, "DATABASE_URL") ? "postgres" : "memory",
        claude: has(env, "ANTHROPIC_API_KEY"),
        prices: has(env, "CHANNEL3_API_KEY") ? "channel3" : "fixture",
        certs: has(env, "PSA_API_TOKEN") ? "psa" : "fixture",
        paypal: has(env, "PAYPAL_CLIENT_ID") && has(env, "PAYPAL_CLIENT_SECRET") ? "sandbox" : "mock",
      };

  const anthropic = modes.claude ? createAnthropicClientFromEnv() : null;
  const priceLookup = modes.prices === "channel3" ? createChannel3PriceLookup(env.CHANNEL3_API_KEY!.trim()) : createFixturePriceLookup();
  const certLookup = modes.certs === "psa" ? createPsaCertLookup(env.PSA_API_TOKEN!.trim()) : createFixtureCertLookup();
  // Photo URLs for the pals: absolute against the public URL when it is known; the pals also get it as a second safety net.
  const photoBaseUrl = photoBase(env);
  const publicDir = path.resolve(process.cwd(), "public");
  const knownPhotos = buildKnownPhotos(photoBaseUrl, publicDir);
  const publicMode = isPublicMode(env, publicDir);
  log(publicModeLine(publicMode, env));
  const sellerPal = createSellerPal({ anthropic, photoBaseUrl, publicMode });
  const buyerPal = createBuyerPal({ anthropic, priceLookup, certLookup, knownPhotos, photoBaseUrl, publicMode, fetchImage: localAwareFetcher(publicDir) });
  log(`[pay-pals] photos: ${knownPhotos.length} known photos for the reused-photo check, base URL ${photoBaseUrl ? "configured" : "from each request"}`);
  const buildEvidencePack = createEvidencePackBuilder({ anthropic, publicMode });
  const paypal = modes.paypal === "sandbox" ? createPayPalGateway(loadPayPalConfig(env)) : createMockPayPalGateway();

  log(`[pay-pals] pals: real Seller Pal and Buyer Pal, ${modes.claude ? "Claude on" : "rules only (ANTHROPIC_API_KEY not set)"}`);
  log(`[pay-pals] prices: ${modes.prices === "channel3" ? "Channel3" : "fixture ranges (CHANNEL3_API_KEY not set)"}`);
  log(`[pay-pals] certs: ${modes.certs === "psa" ? "PSA cert lookup" : "fixture cert records (PSA_API_TOKEN not set)"}`);
  log(`[pay-pals] paypal: ${modes.paypal === "sandbox" ? "sandbox gateway" : "mock gateway, no network (PAYPAL_CLIENT_ID not set)"}`);

  // Demo-only pins every choice, so it pins the payee too: the same build has to render the same
  // page whether or not an .env.local happens to sit on disk, and a sandbox address is a different
  // length from the fixture one. Real mode keeps the substitution, which is what makes a hosted
  // demo payment land in an account someone can look at.
  const configured = demoPayeesFromEnv(env);
  const demoPayees: DemoPayees = demoOnly ? {} : configured;
  if (Object.keys(demoPayees).length > 0) log(`[pay-pals] demo payee: sandbox seller accounts replace the fixture payee on ${Object.keys(demoPayees).join(" and ")}`);
  else if (demoOnly && Object.keys(configured).length > 0) log("[pay-pals] demo payee: fixture payee kept (demo-only mode ignores the sandbox seller keys)");

  let store: PayPalsStore;
  let ready: Promise<void>;
  let seededDeals: Promise<Partial<Record<ScenarioId, string>>>;
  const uploadsEnabled = detectUploadsEnabled();
  log(`[pay-pals] uploads: ${uploadsEnabled ? "on (public/uploads is writable)" : "off (read-only host), photos by URL only"}`);
  const sandboxBuyer =
    modes.paypal === "sandbox" && has(env, "SANDBOX_BUYER_EMAIL") && has(env, "SANDBOX_BUYER_PASSWORD")
      ? { email: env.SANDBOX_BUYER_EMAIL!.trim(), password: env.SANDBOX_BUYER_PASSWORD!.trim() }
      : null;
  if (modes.paypal === "sandbox") log(`[pay-pals] sandbox buyer: ${sandboxBuyer ? "test account available on demo deals" : "not set (SANDBOX_BUYER_EMAIL and SANDBOX_BUYER_PASSWORD)"}`);
  const services = { sellerPal, buyerPal, buildEvidencePack, paypal, demoPayee: demoPayees, clock: systemClock, uploadsEnabled, sandboxBuyer } as Services;
  // The seeder replays each fixture on the fixture's own dates, so the seeded timeline, payment and shipment agree.
  const replay = createReplayClock();

  if (modes.store === "postgres") {
    const url = env.DATABASE_URL!.trim();
    const pg = createPostgresDealStore(url);
    store = pg;
    services.store = store;
    log("[pay-pals] store: Postgres (DATABASE_URL set)");
    const migrated = pg.migrate().catch((error: unknown) => {
      log(`[pay-pals] store: migration did not run (${error instanceof Error ? error.message : String(error)}). Run: npm run migrate -w packages/db`);
    });
    // No seeding on this path. A cold start that replayed the fixtures with real model calls kept the first visitor waiting 119 s.
    log("[pay-pals] demo: finished demo deals are not seeded at start; run npm run demo:seed -w apps/web after a deploy");
    seededDeals = migrated.then(() => ({}));
    ready = migrated;
  } else {
    // One memory store holds everything, so its clock is the replay clock while seeding and the wall clock after.
    let seeding = true;
    store = createMemoryDealStore({ clock: () => (seeding ? replay.clock() : systemClock()) });
    log("[pay-pals] store: in memory (DATABASE_URL not set), demo deals live until the process restarts");
    services.store = store;
    // Rules-only pals for the replay, whatever keys are set: it stays fast, and a keyed local run spends no model calls on start.
    const rulesOnly = {
      buyerPal: createBuyerPal({ anthropic: null, priceLookup: createFixturePriceLookup(), certLookup: createFixtureCertLookup(), knownPhotos, photoBaseUrl, publicMode, fetchImage: localAwareFetcher(publicDir) }),
      buildEvidencePack: createEvidencePackBuilder({ anthropic: null, publicMode }),
    };
    seededDeals = seedFixtureDeals({ ...services, ...rulesOnly, clock: replay.clock }, log, replay).finally(() => {
      seeding = false;
    });
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
