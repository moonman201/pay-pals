/**
 * Drives the PayPal sandbox checkout window as the sandbox buyer, the way a
 * person would: email, next, password, log in, then the pay button. Mirrors
 * packages/paypal/scripts/approve-as-buyer.ts, but on a Playwright page the
 * SDK opened (a popup, or the main page after a redirect) instead of a fresh
 * browser. The window starts on an SDK loading page and moves on its own, so
 * the driver is a loop: each pass handles whatever is visible right now.
 * Credentials are typed into the page and never logged. The caller decides
 * what approval means: the app's onApprove, a state badge, the API.
 */
import type { Page } from "@playwright/test";

export interface SandboxBuyer {
  email: string;
  password: string;
}

const EMAIL = ["#email", 'input[name="login_email"]', 'input[type="email"]', 'input[placeholder*="Email"]'];
const NEXT = ["#btnNext", 'button:has-text("Next")'];
const PASSWORD = ["#password", 'input[name="login_password"]', 'input[type="password"]'];
const LOGIN = ["#btnLogin", 'button:has-text("Log In")'];

/** The pay button on the review page, in the order PayPal has shown them. */
const SUBMIT = [
  "#payment-submit-btn",
  'button[data-testid="submit-button-initial"]',
  "#confirmButtonTop",
  'button:has-text("Complete Purchase")',
  'button:has-text("Pay Now")',
  'button:has-text("Continue")',
  'button:has-text("Agree & Continue")',
];

/** Interstitials that only need dismissing: cookie banner, "stay logged in", app nudges. */
const DISMISS = ["#acceptAllButton", 'button:has-text("Not now")', 'button:has-text("Not Now")', 'button:has-text("No thanks")'];

export interface DriveResult {
  /** Which submit selector was pressed, or null when none ever showed. */
  clicked: string | null;
  /** Steps that happened, in order: email, password, submit selectors. */
  steps: string[];
  /** The last URL seen on the checkout page, with its query removed. */
  lastUrl: string;
  /** True when the checkout window closed on its own, which is how the SDK hands control back to the page. */
  closed: boolean;
  /** Headings and button labels visible when the driver gave up, for the report. */
  stoppedAt: string[];
}

async function describe(page: Page): Promise<string[]> {
  if (page.isClosed()) return ["(window closed)"];
  return page
    .evaluate(() =>
      Array.from(document.querySelectorAll("h1, h2, button, [role=button]"))
        .map((el) => (el.textContent ?? "").trim().replace(/\s+/g, " "))
        .filter((t) => t.length > 0 && t.length < 80)
        .slice(0, 12),
    )
    .catch(() => ["(page not readable)"]);
}

function stripQuery(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

/** The first visible match, or null. Never waits: the loop is the wait. */
async function firstVisible(page: Page, selectors: string[]) {
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible().catch(() => false)) return { sel, el };
  }
  return null;
}

async function clickFirstVisible(page: Page, selectors: string[]): Promise<string | null> {
  const hit = await firstVisible(page, selectors);
  if (!hit) return null;
  await hit.el.click({ timeout: 5_000 }).catch(() => undefined);
  return hit.sel;
}

/**
 * Log in and press pay. Resolves when the checkout window closes (approval
 * handed back to the SDK) or when nothing more can be done within
 * `timeoutMs`. Never throws for a page that will not cooperate: the result
 * says where it stopped so the spec can report it.
 */
export async function driveSandboxCheckout(page: Page, buyer: SandboxBuyer, log: (line: string) => void, timeoutMs = 120_000): Promise<DriveResult> {
  const steps: string[] = [];
  let clicked: string | null = null;
  let lastUrl = stripQuery(page.url());
  let emailDone = false;
  let passwordDone = false;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (page.isClosed()) return { clicked, steps, lastUrl, closed: true, stoppedAt: [] };
    lastUrl = stripQuery(page.url());
    await clickFirstVisible(page, DISMISS);

    const password = passwordDone ? null : await firstVisible(page, PASSWORD);
    if (password) {
      await password.el.fill(buyer.password);
      await clickFirstVisible(page, LOGIN);
      passwordDone = true;
      steps.push("password");
      log("sandbox: logged in as the sandbox buyer");
      await page.waitForTimeout(2_000);
      continue;
    }

    const email = emailDone ? null : await firstVisible(page, EMAIL);
    if (email) {
      await email.el.fill(buyer.email);
      await clickFirstVisible(page, NEXT);
      emailDone = true;
      steps.push("email");
      log("sandbox: email entered");
      await page.waitForTimeout(2_000);
      continue;
    }

    const sel = await clickFirstVisible(page, SUBMIT);
    if (sel) {
      clicked = sel;
      steps.push(sel);
      log(`sandbox: pressed ${sel}`);
      // Give the window time to close; a second review step gets another pass of the loop.
      await page.waitForEvent("close", { timeout: 15_000 }).catch(() => undefined);
      continue;
    }

    await page.waitForTimeout(1_000);
  }
  return { clicked, steps, lastUrl, closed: page.isClosed(), stoppedAt: await describe(page) };
}
