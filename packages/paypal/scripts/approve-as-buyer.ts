/**
 * Approves a sandbox order as the sandbox buyer in a headless browser, the
 * way a person would click through the PayPal wallet. Used by the Lane 0
 * gate when the test-card path is not available. Sandbox only.
 *
 * Credentials come from SANDBOX_BUYER_EMAIL and SANDBOX_BUYER_PASSWORD in the
 * environment. They are typed into the page and never printed or passed on
 * a command line. On failure a screenshot goes to the path in
 * GATE_SCREENSHOT_DIR (default: the OS temp dir), never into the repo.
 *
 * Standalone:
 *   npx tsx scripts/approve-as-buyer.ts <orderId>
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { loadEnvLocal } from "../src/load-env";

export interface BuyerCredentials {
  email: string;
  password: string;
}

export function buyerCredentialsFromEnv(env: Record<string, string | undefined> = process.env): BuyerCredentials | null {
  const email = env.SANDBOX_BUYER_EMAIL;
  const password = env.SANDBOX_BUYER_PASSWORD;
  return email && password ? { email, password } : null;
}

const SUBMIT_SELECTORS = [
  "#payment-submit-btn",
  'button[data-testid="submit-button-initial"]',
  "#confirmButtonTop",
  'button:has-text("Complete Purchase")',
  'button:has-text("Pay Now")',
  'button:has-text("Continue")',
  'button:has-text("Agree & Continue")',
];

async function clickFirst(page: Page, selectors: string[], timeoutMs: number): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        await el.click({ timeout: 5_000 }).catch(() => undefined);
        return sel;
      }
    }
    await page.waitForTimeout(500);
  }
  return null;
}

async function login(page: Page, creds: BuyerCredentials): Promise<void> {
  // Cookie banner, when shown.
  await page.locator("#acceptAllButton").first().click({ timeout: 3_000 }).catch(() => undefined);

  const email = page.locator("#email").first();
  if (await email.isVisible({ timeout: 20_000 }).catch(() => false)) {
    await email.fill(creds.email);
    const next = page.locator("#btnNext").first();
    if (await next.isVisible().catch(() => false)) await next.click();
  }
  const password = page.locator("#password").first();
  await password.waitFor({ state: "visible", timeout: 20_000 });
  await password.fill(creds.password);
  await page.locator("#btnLogin").first().click();
}

/**
 * Opens the approve link, logs in as the buyer, submits the review page.
 * Resolves once the submit button was clicked; the caller polls the order
 * status with the API, which is the source of truth.
 */
export async function approveAsBuyer(approveUrl: string, creds: BuyerCredentials, log: (line: string) => void = () => undefined): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: "en-US" });
  const page = await context.newPage();
  try {
    await page.goto(approveUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    log("  browser: approve page opened");
    await login(page, creds);
    log("  browser: logged in as the sandbox buyer");
    // Some flows show a second login (one-time code screen) or a "continue" interstitial first.
    const clicked = await clickFirst(page, SUBMIT_SELECTORS, 60_000);
    if (!clicked) throw new Error("No pay/continue button found on the review page");
    log(`  browser: clicked ${clicked}`);
    // The first click can land on a shipping/review step; try once more for a final pay button.
    await page.waitForTimeout(3_000);
    const again = await clickFirst(page, SUBMIT_SELECTORS.slice(0, 5), 15_000);
    if (again) log(`  browser: clicked ${again}`);
    await page.waitForTimeout(3_000);
  } catch (err) {
    const dir = process.env.GATE_SCREENSHOT_DIR ?? mkdtempSync(join(tmpdir(), "pay-pals-gate-"));
    const file = join(dir, `approve-failure-${Date.now()}.png`);
    await page.screenshot({ path: file, fullPage: true }).catch(() => undefined);
    log(`  browser: failed, screenshot at ${file}`);
    throw err;
  } finally {
    await browser.close();
  }
}

const isMain = process.argv[1]?.endsWith("approve-as-buyer.ts");
if (isMain) {
  loadEnvLocal();
  const orderId = process.argv[2];
  const creds = buyerCredentialsFromEnv();
  if (!orderId || !creds) {
    console.error("Usage: npx tsx scripts/approve-as-buyer.ts <orderId>  (needs SANDBOX_BUYER_EMAIL and SANDBOX_BUYER_PASSWORD)");
    process.exit(2);
  }
  approveAsBuyer(`https://www.sandbox.paypal.com/checkoutnow?token=${encodeURIComponent(orderId)}`, creds, console.log)
    .then(() => console.log("done; check the order status with GET /v2/checkout/orders/{id}"))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
