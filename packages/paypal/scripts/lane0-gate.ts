/**
 * Lane 0 gate: can a sandbox PERSONAL account be the payee on an Orders v2
 * checkout order, and can a BUSINESS account? For each account this script
 * creates an order with payee.email_address set to that account, carrying
 * the clean-garmin fixture card as the line item, gets it approved, captures
 * it, then reads the order back and checks the payee and the card text.
 *
 * Approval, in order of preference:
 *   1. A sandbox test card on the order (unattended). Only works when the
 *      payee can take card payments.
 *   2. The PayPal wallet: a fresh order is approved by the sandbox buyer in a
 *      headless browser (scripts/approve-as-buyer.ts) when
 *      SANDBOX_BUYER_EMAIL and SANDBOX_BUYER_PASSWORD are set.
 *   3. The approve link is printed and the script waits for a person.
 *
 * Run from the repo root with credentials in .env.local:
 *   npm run gate -w packages/paypal
 *   npm run gate -w packages/paypal -- --account business   (or personal)
 *   npm run gate -w packages/paypal -- --no-wait             (never prompt; report PENDING instead)
 *
 * Prints order ids and capture ids. Never prints secrets; payee emails are
 * masked to their domain.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { CONDITION_LABELS, getFixture } from "@pay-pals/contracts";
import type { ItemCard } from "@pay-pals/contracts";
import { ENV_LOCAL_PATH, loadEnvLocal } from "../src/load-env";
import { hasSandboxCredentials, loadPayPalConfig } from "../src/config";
import { createPayPalGateway, type PayPalsGateway } from "../src/gateway";
import { PayPalApiError } from "../src/http-error";
import { buildOrderBody } from "../src/order-body";
import { confirmOrderWithTestCard } from "../src/sandbox/test-card";
import { approveAsBuyer, buyerCredentialsFromEnv } from "./approve-as-buyer";

type Result = "PASS" | "FAIL" | "PENDING";
interface Outcome {
  account: string;
  payee: string;
  result: Result;
  path?: "test card" | "wallet";
  orderId?: string;
  /** The custom_id on the order, so it can be checked from outside. */
  dealId?: string;
  captureId?: string;
  detail: string;
}

const ACCOUNTS = ["both", "personal", "business"] as const;

function parseArgs(argv: string[]): { account: (typeof ACCOUNTS)[number]; noWait: boolean } {
  let account = "both";
  let noWait = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--no-wait") noWait = true;
    else if (a.startsWith("--account=")) account = a.slice("--account=".length);
    else if (a === "--account") account = argv[++i] ?? "";
    else {
      console.error(`Unknown argument ${a}`);
      process.exit(2);
    }
  }
  if (!(ACCOUNTS as readonly string[]).includes(account)) {
    console.error(`--account must be one of ${ACCOUNTS.join(", ")}`);
    process.exit(2);
  }
  return { account: account as (typeof ACCOUNTS)[number], noWait };
}

const mask = (email: string): string => `***@${email.split("@")[1] ?? "?"}`;

function describeError(err: unknown): string {
  if (err instanceof PayPalApiError) return `${err.message}\n  PayPal body: ${JSON.stringify(err.body)}`;
  return err instanceof Error ? err.message : String(err);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForStatus(gateway: PayPalsGateway, orderId: string, wanted: string[], timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let status = "";
  while (Date.now() < deadline) {
    status = String((await gateway.getOrder(orderId)).status);
    if (wanted.includes(status)) return status;
    await sleep(3_000);
  }
  return status;
}

/** Path 1: approve with a sandbox test card and capture. Throws on any failure. */
async function captureViaTestCard(gateway: PayPalsGateway, card: ItemCard, dealId: string) {
  const created = await gateway.createDealOrder(card, dealId);
  console.log(`  [test card] created order ${created.orderId} (${created.status}), custom_id / deal ${dealId}`);
  const confirmed = await confirmOrderWithTestCard(gateway.http, created.orderId);
  console.log(`  [test card] confirmed, order status ${String(confirmed.status)}`);
  try {
    const capture = await gateway.captureOrder(created.orderId);
    return { orderId: created.orderId, capture };
  } catch (err) {
    // Orders v2 has no void for a CAPTURE-intent order, so an approved but
    // uncaptured order can only be left to expire. Log it so it is traceable.
    console.log(`  [test card] abandoning approved order ${created.orderId} (deal ${dealId}); it expires on its own and nothing was charged`);
    throw err;
  }
}

/** Path 2 and 3: a fresh order approved through the PayPal wallet, then captured. */
async function captureViaWallet(gateway: PayPalsGateway, card: ItemCard, dealId: string, noWait: boolean) {
  const body = {
    ...buildOrderBody(card, dealId),
    application_context: {
      return_url: "https://example.com/pay-pals/return",
      cancel_url: "https://example.com/pay-pals/cancel",
      user_action: "PAY_NOW",
      shipping_preference: "NO_SHIPPING",
    },
  };
  const order = await gateway.http.request("POST", "/v2/checkout/orders", body, { "PayPal-Request-Id": crypto.randomUUID() });
  const orderId = String(order.id);
  const approveUrl = ((order.links as Array<{ rel: string; href: string }>) ?? []).find((l) => l.rel === "approve")?.href ?? null;
  console.log(`  [wallet] created order ${orderId} (${String(order.status)}), custom_id / deal ${dealId}`);
  if (!approveUrl) throw new Error("PayPal returned no approve link");

  const creds = buyerCredentialsFromEnv();
  if (creds) {
    console.log("  [wallet] approving as the sandbox buyer in a headless browser");
    await approveAsBuyer(approveUrl, creds, console.log);
  } else if (noWait) {
    return { orderId, approveUrl, capture: null };
  } else {
    console.log(`  [wallet] approve link: ${approveUrl}`);
    console.log("  [wallet] open it in a private window, log in as the sandbox buyer, approve, then come back here.");
    const rl = createInterface({ input: stdin, output: stdout });
    await rl.question("  press Enter once approved: ");
    rl.close();
  }

  const status = await waitForStatus(gateway, orderId, ["APPROVED", "COMPLETED"], 90_000);
  console.log(`  [wallet] order status after approval: ${status}`);
  if (status !== "APPROVED" && status !== "COMPLETED") {
    return { orderId, approveUrl, capture: null };
  }
  const capture = await gateway.captureOrder(orderId);
  return { orderId, approveUrl, capture };
}

async function verify(gateway: PayPalsGateway, orderId: string, card: ItemCard, dealId: string, payee: string, captureId: string): Promise<string[]> {
  const order = await gateway.getOrder(orderId);
  const unit = (order.purchase_units as Array<Record<string, unknown>>)[0] ?? {};
  const item = ((unit.items as Array<Record<string, string>> | undefined) ?? [])[0] ?? {};
  const payeeOnOrder = (unit.payee as { email_address?: string } | undefined)?.email_address;
  // The capture record is where PayPal says what the seller actually receives.
  const captureDetail = await gateway.http.request("GET", `/v2/payments/captures/${encodeURIComponent(captureId)}`);
  const breakdown = captureDetail.seller_receivable_breakdown as { net_amount?: { value?: string; currency_code?: string }; paypal_fee?: { value?: string } } | undefined;
  console.log(`  capture ${captureId}: status ${String(captureDetail.status)}, seller net ${breakdown?.net_amount?.value ?? "?"} ${breakdown?.net_amount?.currency_code ?? ""} after fee ${breakdown?.paypal_fee?.value ?? "?"}`);
  const checks: Array<[string, boolean]> = [
    ["order status COMPLETED", order.status === "COMPLETED"],
    ["capture status COMPLETED on GET /v2/payments/captures", captureDetail.status === "COMPLETED"],
    ["seller net amount present (funds landed)", Boolean(breakdown?.net_amount?.value)],
    ["payee is the account under test", payeeOnOrder === payee],
    ["item name carries the title", item.name === card.title],
    ["item description carries the serial", (item.description ?? "").includes(`Serial ${card.serial}`)],
    ["item description carries the condition", (item.description ?? "").includes(`Condition: ${CONDITION_LABELS[card.conditionGrade]}`)],
    ["custom_id is the deal id", unit.custom_id === dealId],
  ];
  for (const [label, ok] of checks) console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
  return checks.filter(([, ok]) => !ok).map(([l]) => l);
}

async function gateOne(gateway: PayPalsGateway, account: string, payee: string, noWait: boolean): Promise<Outcome> {
  const fx = getFixture("clean-garmin");
  const card: ItemCard = { ...fx.cards[1]!, sellerPaypalEmail: payee };
  const base = { account, payee: mask(payee) };
  console.log(`\n== ${account.toUpperCase()} payee ${mask(payee)}`);

  let path: Outcome["path"] = "test card";
  let orderId: string | undefined;
  let dealId = crypto.randomUUID();
  let capture: Awaited<ReturnType<PayPalsGateway["captureOrder"]>> | null = null;
  try {
    const r = await captureViaTestCard(gateway, card, dealId);
    orderId = r.orderId;
    capture = r.capture;
  } catch (err) {
    console.log(`  [test card] not available: ${err instanceof PayPalApiError ? (err.details?.[0]?.issue ?? err.paypalName ?? err.status) : describeError(err)}`);
    path = "wallet";
    dealId = crypto.randomUUID();
    try {
      const r = await captureViaWallet(gateway, card, dealId, noWait);
      orderId = r.orderId;
      if (!r.capture) {
        return { ...base, dealId, result: "PENDING", path, orderId, detail: `Order created but not approved. Approve ${r.approveUrl} as the sandbox buyer, then capture it (Postman request 5).` };
      }
      capture = r.capture;
    } catch (walletErr) {
      const detail = describeError(walletErr);
      console.log(`  [wallet] FAIL ${detail}`);
      return { ...base, dealId, result: "FAIL", path, orderId, detail };
    }
  }

  console.log(`  captured ${capture.captureId} (${capture.status}) ${capture.amount} ${capture.currency} to ${capture.payeeEmail ? mask(capture.payeeEmail) : "(no payee in response)"}`);
  const failed = await verify(gateway, orderId!, card, dealId, payee, capture.captureId);
  return failed.length === 0
    ? { ...base, dealId, result: "PASS", path, orderId, captureId: capture.captureId, detail: "Order created, approved, captured; payee and card text confirmed on GET." }
    : { ...base, dealId, result: "FAIL", path, orderId, captureId: capture.captureId, detail: `Checks failed: ${failed.join("; ")}` };
}

async function main(): Promise<void> {
  const { account, noWait } = parseArgs(process.argv.slice(2));
  const loaded = loadEnvLocal();
  if (!hasSandboxCredentials()) {
    console.error(`No PayPal sandbox credentials. ${loaded ? `Loaded ${ENV_LOCAL_PATH} but` : `${ENV_LOCAL_PATH} not found and`} PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are unset. See .env.example.`);
    process.exit(2);
  }
  const config = loadPayPalConfig();
  console.log(`PayPal env: ${config.env} (${config.baseUrl})`);
  const wallet = buyerCredentialsFromEnv()
    ? "then the PayPal wallet, approved headlessly as the sandbox buyer"
    : noWait
      ? "then report PENDING with the approve link (no SANDBOX_BUYER_EMAIL / SANDBOX_BUYER_PASSWORD, and --no-wait)"
      : "then print the approve link and wait for a person (set SANDBOX_BUYER_EMAIL and SANDBOX_BUYER_PASSWORD for headless approval)";
  console.log(`Approval path: sandbox test card first, ${wallet}.`);
  const gateway = createPayPalGateway(config);

  const accounts: Array<[string, string | undefined]> = [];
  if (account !== "business") accounts.push(["personal", process.env.SANDBOX_SELLER_PERSONAL_EMAIL]);
  if (account !== "personal") accounts.push(["business", process.env.SANDBOX_SELLER_BUSINESS_EMAIL]);

  const outcomes: Outcome[] = [];
  for (const [name, payee] of accounts) {
    if (!payee) {
      outcomes.push({ account: name, payee: "(unset)", result: "FAIL", detail: `SANDBOX_SELLER_${name.toUpperCase()}_EMAIL is not set in .env.local.` });
      continue;
    }
    outcomes.push(await gateOne(gateway, name, payee, noWait));
  }

  console.log("\n== Lane 0 gate result");
  for (const o of outcomes) {
    console.log(`${o.result} ${o.account}: payee ${o.payee}${o.path ? `, via ${o.path}` : ""}${o.orderId ? `, order ${o.orderId}` : ""}${o.captureId ? `, capture ${o.captureId}` : ""}${o.dealId ? `, deal ${o.dealId}` : ""}`);
    console.log(`     ${o.detail}`);
  }
  process.exit(outcomes.length > 0 && outcomes.every((o) => o.result === "PASS") ? 0 : 1);
}

main().catch((err) => {
  console.error(describeError(err));
  process.exit(1);
});
