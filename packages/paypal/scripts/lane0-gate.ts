/**
 * Lane 0 gate: can a sandbox PERSONAL account be the payee on an Orders v2
 * checkout order, and can a BUSINESS account? For each account this script
 * creates an order with payee.email_address set to that account, carrying
 * the clean-garmin fixture card as the line item, gets it approved, captures
 * it, then reads the order back and checks the payee and the card text.
 *
 * Approval: it first tries a sandbox test card (unattended). If the sandbox
 * app does not accept cards it prints the approve link and waits for you to
 * approve as the sandbox buyer, then captures.
 *
 * Run from the repo root with credentials in .env.local:
 *   npm run gate -w packages/paypal
 *   npm run gate -w packages/paypal -- --account business   (or personal)
 *   npm run gate -w packages/paypal -- --no-wait             (never prompt; report PENDING instead)
 *
 * Prints order ids and capture ids. Never prints the token or secrets.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { CONDITION_LABELS, getFixture } from "@pay-pals/contracts";
import { ENV_LOCAL_PATH, loadEnvLocal } from "../src/load-env";
import { hasSandboxCredentials, loadPayPalConfig } from "../src/config";
import { createPayPalGateway, type PayPalsGateway } from "../src/gateway";
import { PayPalApiError } from "../src/http-error";
import { confirmOrderWithTestCard } from "../src/sandbox/test-card";

type Outcome = { account: string; payee: string; result: "PASS" | "FAIL" | "PENDING"; orderId?: string; captureId?: string; detail: string };

const args = new Set(process.argv.slice(2));
const accountArg = [...args].find((a) => a.startsWith("--account="))?.split("=")[1] ?? (args.has("--account") ? process.argv[process.argv.indexOf("--account") + 1] : "both");
const noWait = args.has("--no-wait");

function describeError(err: unknown): string {
  if (err instanceof PayPalApiError) return `${err.message}\n  PayPal body: ${JSON.stringify(err.body)}`;
  return err instanceof Error ? err.message : String(err);
}

async function approve(gateway: PayPalsGateway, orderId: string, approveUrl: string | null, buyerEmail: string | undefined): Promise<"approved" | "pending"> {
  try {
    const confirmed = await confirmOrderWithTestCard(gateway.http, orderId);
    console.log(`  test card accepted, order status ${String(confirmed.status)}`);
    return "approved";
  } catch (err) {
    console.log(`  test card not accepted: ${err instanceof PayPalApiError ? (err.details?.[0]?.issue ?? err.paypalName ?? err.status) : describeError(err)}`);
  }
  if (noWait) return "pending";
  console.log(`  approve link: ${approveUrl ?? "(none returned)"}`);
  console.log(`  open it in a private window, log in as the sandbox buyer${buyerEmail ? ` (${buyerEmail})` : ""}, approve, then come back here.`);
  const rl = createInterface({ input: stdin, output: stdout });
  await rl.question("  press Enter once approved: ");
  rl.close();
  return "approved";
}

async function gateOne(gateway: PayPalsGateway, account: string, payee: string, buyerEmail: string | undefined): Promise<Outcome> {
  const fx = getFixture("clean-garmin");
  const card = { ...fx.cards[1]!, sellerPaypalEmail: payee };
  const dealId = crypto.randomUUID();
  console.log(`\n== ${account.toUpperCase()} payee ${payee} (deal ${dealId})`);
  let orderId: string | undefined;
  try {
    const created = await gateway.createDealOrder(card, dealId);
    orderId = created.orderId;
    console.log(`  created order ${orderId} (${created.status})`);

    const approval = await approve(gateway, orderId, created.approveUrl, buyerEmail);
    if (approval === "pending") {
      return { account, payee, result: "PENDING", orderId, detail: `Order created. Approve ${created.approveUrl} as the buyer, then capture with the Postman collection or rerun without --no-wait.` };
    }

    const capture = await gateway.captureOrder(orderId);
    console.log(`  captured ${capture.captureId} (${capture.status}) ${capture.amount} ${capture.currency} to ${capture.payeeEmail}`);

    const order = await gateway.getOrder(orderId);
    const unit = (order.purchase_units as Array<Record<string, unknown>>)[0] ?? {};
    const item = ((unit.items as Array<Record<string, string>> | undefined) ?? [])[0] ?? {};
    const payeeOnOrder = (unit.payee as { email_address?: string } | undefined)?.email_address;
    const checks: Array<[string, boolean]> = [
      ["order status COMPLETED", order.status === "COMPLETED"],
      ["capture status COMPLETED", capture.status === "COMPLETED"],
      [`payee is ${payee}`, payeeOnOrder === payee],
      ["item name carries the title", item.name === card.title],
      ["item description carries the serial", (item.description ?? "").includes(`Serial ${card.serial}`)],
      ["item description carries the condition", (item.description ?? "").includes(`Condition: ${CONDITION_LABELS[card.conditionGrade]}`)],
      ["custom_id is the deal id", unit.custom_id === dealId],
    ];
    for (const [label, ok] of checks) console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
    const failed = checks.filter(([, ok]) => !ok).map(([l]) => l);
    return failed.length === 0
      ? { account, payee, result: "PASS", orderId, captureId: capture.captureId, detail: "Order created, approved, captured; payee and card text confirmed on GET." }
      : { account, payee, result: "FAIL", orderId, captureId: capture.captureId, detail: `Checks failed: ${failed.join("; ")}` };
  } catch (err) {
    const detail = describeError(err);
    console.log(`  FAIL ${detail}`);
    return { account, payee, result: "FAIL", orderId, detail };
  }
}

async function main(): Promise<void> {
  const loaded = loadEnvLocal();
  if (!hasSandboxCredentials()) {
    console.error(`No PayPal sandbox credentials. ${loaded ? `Loaded ${ENV_LOCAL_PATH} but` : `${ENV_LOCAL_PATH} not found and`} PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are unset. See .env.example.`);
    process.exit(2);
  }
  const config = loadPayPalConfig();
  console.log(`PayPal env: ${config.env} (${config.baseUrl})`);
  const gateway = createPayPalGateway(config);

  const accounts: Array<[string, string | undefined]> = [];
  if (accountArg === "both" || accountArg === "personal") accounts.push(["personal", process.env.SANDBOX_SELLER_PERSONAL_EMAIL]);
  if (accountArg === "both" || accountArg === "business") accounts.push(["business", process.env.SANDBOX_SELLER_BUSINESS_EMAIL]);

  const outcomes: Outcome[] = [];
  for (const [account, payee] of accounts) {
    if (!payee) {
      outcomes.push({ account, payee: "(unset)", result: "FAIL", detail: `SANDBOX_SELLER_${account.toUpperCase()}_EMAIL is not set in .env.local.` });
      continue;
    }
    outcomes.push(await gateOne(gateway, account, payee, process.env.SANDBOX_BUYER_EMAIL));
  }

  console.log("\n== Lane 0 gate result");
  for (const o of outcomes) {
    console.log(`${o.result} ${o.account}: payee ${o.payee}${o.orderId ? `, order ${o.orderId}` : ""}${o.captureId ? `, capture ${o.captureId}` : ""}`);
    console.log(`     ${o.detail}`);
  }
  process.exit(outcomes.every((o) => o.result === "PASS") ? 0 : 1);
}

main().catch((err) => {
  console.error(describeError(err));
  process.exit(1);
});
