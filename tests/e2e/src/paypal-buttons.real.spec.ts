/**
 * Real mode: the PayPal JS SDK v6 buttons in a browser, against the sandbox.
 * Runs only under playwright.real.config.ts. The clean deal is started from
 * the landing page, reviewed by the real Buyer Pal, agreed by both sides, and
 * then paid by clicking the real PayPal button and logging in to the sandbox
 * checkout window as the sandbox buyer. Asserts the SDK loaded, both wallet
 * buttons rendered, no demo button exists, the deal reaches Paid, and the API
 * shows a captured sandbox payment. The Venmo button is only observed: the
 * sandbox Venmo flow needs a phone.
 *
 * Every stage past the buttons is reported, not just asserted: when PayPal
 * will not let the checkout window be driven, the test still says exactly
 * which page it reached and leaves a screenshot in tests/e2e/screenshots/.
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { cleanGarmin } from "@pay-pals/contracts";
import { WEB_PRESENT } from "./env";
import { reviewAndAgree } from "./flows";
import { expectState, panel, startDemo } from "./helpers";
import { sandboxBuyer } from "./real-env";
import { driveSandboxCheckout } from "./sandbox-buyer";

const SDK_URL = "https://www.sandbox.paypal.com/web-sdk/v6/core";
const SCREENSHOTS = resolve(dirname(fileURLToPath(import.meta.url)), "..", "screenshots");
/** From the button click to the Paid badge: the sandbox login, the pay button, and the app's capture call. */
const CHECKOUT_TIMEOUT = 150_000;
const CAPTURE_TIMEOUT = 60_000;

interface PaymentSnapshot {
  deal: { id: string; state: string };
  payment: { paypalOrderId: string; captureId: string | null; status: string; method: string; payeeEmail: string } | null;
  payMode: "sandbox" | "mock";
}

async function shot(page: Page, name: string): Promise<string> {
  mkdirSync(SCREENSHOTS, { recursive: true });
  const file = resolve(SCREENSHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

/** The checkout window the SDK opens on click: a popup, or the main page after a redirect. */
async function checkoutWindow(page: Page, click: () => Promise<void>): Promise<{ kind: "popup" | "redirect" | "none"; target: Page | null }> {
  const popup = page.waitForEvent("popup", { timeout: 30_000 }).catch(() => null);
  await click();
  const target = await popup;
  if (target) {
    await target.waitForLoadState("domcontentloaded").catch(() => undefined);
    return { kind: "popup", target };
  }
  if (/paypal\.com/.test(page.url())) return { kind: "redirect", target: page };
  return { kind: "none", target: null };
}

test.describe("PayPal and Venmo buttons, sandbox", () => {
  test.skip(!WEB_PRESENT, "apps/web is not on this branch yet, nothing to load");

  test("renders the SDK v6 buttons and pays a clean deal with the sandbox buyer", async ({ page }, testInfo) => {
    const log = (line: string) => {
      console.log(`  ${line}`);
      testInfo.annotations.push({ type: "real", description: line });
    };
    const sdkRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().startsWith(SDK_URL)) sdkRequests.push(req.url());
    });
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const dealId = await startDemo(page, cleanGarmin, "buyer");
    log(`deal ${dealId}`);
    await expectState(page, "Listed");

    // Real Buyer Pal review (Claude plus the price lookup), then both sides agree.
    await reviewAndAgree(page, dealId, 1);

    // The pay step on the buyer's page, with the real buttons.
    const pay = panel(page, "Pay");
    await expect(pay.getByText("Goods and Services", { exact: false })).toBeVisible();
    const paypalButton = pay.locator("paypal-button");
    const venmoButton = pay.locator("venmo-button");
    await expect(paypalButton, "paypal-button element").toBeVisible({ timeout: 30_000 });
    await expect(venmoButton, "venmo-button element").toBeVisible();
    await expect(page.getByRole("button", { name: /\(demo\)/ })).toHaveCount(0);
    await expect(pay.getByText("Loading PayPal.")).toHaveCount(0);

    expect(sdkRequests.length, `request for ${SDK_URL}`).toBeGreaterThan(0);
    const sdk = await page.evaluate((url) => ({
      script: document.querySelector(`script[src="${url}"]`) !== null,
      global: typeof (window as Window & { paypal?: unknown }).paypal === "object",
    }), SDK_URL);
    expect(sdk.script, "SDK script tag in the DOM").toBe(true);
    expect(sdk.global, "window.paypal defined").toBe(true);

    const box = await paypalButton.boundingBox();
    expect(box?.width ?? 0, "paypal-button has a width").toBeGreaterThan(40);
    expect(box?.height ?? 0, "paypal-button has a height").toBeGreaterThan(20);
    log(`SDK loaded (${sdkRequests.length} request), paypal-button ${Math.round(box!.width)}x${Math.round(box!.height)}, venmo-button visible, no demo button`);
    log(`screenshot ${await shot(page, "real-pay-step-before-click")}`);

    // Venmo on desktop: observe only. Sandbox Venmo needs a phone, so whatever opens is noted and closed.
    const venmo = await checkoutWindow(page, () => venmoButton.click());
    if (venmo.target && venmo.kind === "popup") {
      await venmo.target.waitForLoadState("load", { timeout: 20_000 }).catch(() => undefined);
      await page.waitForTimeout(3_000);
      const url = venmo.target.isClosed() ? "(closed itself)" : venmo.target.url().replace(/\?.*$/, "");
      const heading = venmo.target.isClosed() ? "" : await venmo.target.locator("h1, h2").first().textContent({ timeout: 5_000 }).catch(() => "");
      log(`venmo click on desktop: popup to ${url}${heading ? `, heading "${heading.trim()}"` : ""}`);
      if (!venmo.target.isClosed()) {
        log(`screenshot ${await shot(venmo.target, "real-venmo-desktop-popup")}`);
        await venmo.target.close();
      }
    } else if (venmo.kind === "redirect") {
      log(`venmo click on desktop: redirected the page to ${page.url().replace(/\?.*$/, "")}`);
      await page.goBack();
    } else {
      // No window: the SDK may render in place (a QR code modal) or report an error through onError.
      await page.waitForTimeout(3_000);
      const modalText = await page.locator("dialog, [role=dialog]").first().textContent({ timeout: 3_000 }).catch(() => null);
      const stepError = await pay.locator("[role=alert]").first().textContent({ timeout: 1_000 }).catch(() => null);
      log(`venmo click on desktop: no popup or redirect; dialog ${modalText ? JSON.stringify(modalText.slice(0, 120)) : "none"}, error ${stepError ? JSON.stringify(stepError.trim()) : "none"}`);
      log(`screenshot ${await shot(page, "real-venmo-desktop-after-click")}`);
      await page.keyboard.press("Escape");
    }
    // Back on the buyer's page, the step must still offer the PayPal button.
    await expect(paypalButton).toBeVisible();

    // PayPal: the real checkout, as the sandbox buyer.
    const buyer = sandboxBuyer();
    const checkout = await checkoutWindow(page, () => paypalButton.click());
    log(`paypal click: ${checkout.kind}${checkout.target ? ` ${checkout.target.url().replace(/\?.*$/, "")}` : ""}`);
    expect(checkout.kind, "the PayPal button opened a checkout window").not.toBe("none");

    if (!buyer) {
      log("SANDBOX_BUYER_EMAIL or SANDBOX_BUYER_PASSWORD not set: stopping after the checkout window opened");
      if (checkout.target && !checkout.target.isClosed()) log(`screenshot ${await shot(checkout.target, "real-checkout-window")}`);
      test.skip(true, "no sandbox buyer credentials; the buttons and the checkout window were verified");
    }

    const drive = await driveSandboxCheckout(checkout.target!, buyer!, log, CHECKOUT_TIMEOUT);
    if (!drive.closed) {
      log(`checkout window did not close. steps ${drive.steps.join(", ") || "none"}, last url ${drive.lastUrl}, visible: ${drive.stoppedAt.join(" | ")}`);
      if (checkout.target && !checkout.target.isClosed()) log(`screenshot ${await shot(checkout.target, "real-checkout-stopped")}`);
    } else {
      log(`checkout window closed after ${drive.steps.join(", ") || "no step"}, last url ${drive.lastUrl}`);
    }

    // The SDK's onApprove calls POST /api/deals/[id]/capture; the badge follows.
    await expect(page.getByRole("banner").getByText("Paid", { exact: true })).toBeVisible({ timeout: CAPTURE_TIMEOUT });
    await expect(panel(page, "Payment")).toBeVisible();
    log(`screenshot ${await shot(page, "real-paid-room")}`);

    const res = await page.request.get(`/api/deals/${dealId}`);
    expect(res.ok(), `GET /api/deals/${dealId} -> ${res.status()}`).toBe(true);
    const snap = (await res.json()) as PaymentSnapshot;
    expect(snap.payMode).toBe("sandbox");
    expect(snap.deal.state).toBe("PAID");
    expect(snap.payment, "payment record").not.toBeNull();
    expect(snap.payment!.status).toBe("CAPTURED");
    expect(snap.payment!.captureId, "captureId").toMatch(/^[A-Z0-9]{10,}$/);
    expect(snap.payment!.paypalOrderId, "a sandbox order id, not a DEMO- one").toMatch(/^[A-Z0-9]{10,}$/);
    expect(snap.payment!.method).toBe("paypal");
    log(`paid: order ${snap.payment!.paypalOrderId}, capture ${snap.payment!.captureId}, payee ${snap.payment!.payeeEmail}`);

    if (consoleErrors.length > 0) log(`browser console errors (${consoleErrors.length}): ${consoleErrors.slice(0, 3).map((e) => e.slice(0, 160)).join(" | ")}`);
  });
});
