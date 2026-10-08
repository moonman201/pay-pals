/**
 * Live site review, Oct 7, PLAN item 15: the three finished demo deals from
 * the landing page's "See the finished deal" links, and their evidence
 * pages, at desktop (1280) and phone (390) width. Each page is screenshotted
 * into screenshots/review-oct7/ (gitignored) and checked for horizontal
 * scroll, empty panels, the state badge, and flag badges that are separate
 * elements. Fixtures only, no keys.
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { ALL_FIXTURES } from "@pay-pals/contracts";
import type { ScenarioFixture } from "@pay-pals/contracts";
import { WEB_PRESENT } from "./env";
import { expectNoHorizontalScroll, waitForHydration } from "./helpers";

const SHOTS = resolve(dirname(fileURLToPath(import.meta.url)), "..", "screenshots", "review-oct7");
const WIDTHS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "phone", width: 390, height: 844 },
] as const;

const STATE_LABEL: Record<ScenarioFixture["deal"]["state"], string> = {
  DRAFT: "Draft",
  INVITED: "Waiting for the seller",
  LISTED: "Listed",
  REVIEWED: "Reviewed",
  AGREED: "Agreed, card locked",
  PAYMENT_PENDING: "Payment pending",
  PAID: "Paid",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  COMPLETE: "Complete",
  BLOCKED: "Blocked",
  ISSUE: "Issue open",
  CANCELLED: "Cancelled",
};

async function shoot(page: Page, name: string): Promise<string> {
  mkdirSync(SHOTS, { recursive: true });
  const path = resolve(SHOTS, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  return path;
}

/** Every panel with a heading must say something beyond its heading. */
async function expectNoEmptyPanels(page: Page, where: string): Promise<void> {
  const sections = page.locator("section").filter({ has: page.getByRole("heading") });
  const count = await sections.count();
  expect(count, `${where}: panels on the page`).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const section = sections.nth(i);
    const heading = (await section.getByRole("heading").first().textContent())?.trim() ?? "";
    const body = ((await section.textContent()) ?? "").replace(heading, "").trim();
    expect(body.length, `${where}: panel "${heading}" is empty`).toBeGreaterThan(0);
  }
}

/**
 * Each flag line carries its severity, its label and (when it applies) the
 * no-override note as separate elements. textContent runs siblings together
 * with no space, so the check is structural: the severity element's own text
 * is exactly the severity word, the label is another element that does not
 * begin with that word, and the note is a third.
 */
async function expectSeparateFlagBadges(list: Locator, where: string): Promise<void> {
  const items = list.getByRole("listitem");
  const n = await items.count();
  expect(n, `${where}: flags`).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const item = items.nth(i);
    const severity = item.locator("span").filter({ hasText: /^(info|caution|stop)$/ });
    await expect(severity, `${where}: flag ${i + 1} has a severity badge of its own`).toHaveCount(1);
    const severityWord = ((await severity.textContent()) ?? "").trim();
    const spans = item.locator("span");
    const texts = (await spans.allTextContents()).map((t) => t.trim()).filter((t) => t.length > 0);
    expect(texts.length, `${where}: flag ${i + 1} has a label element beside the severity`).toBeGreaterThanOrEqual(2);
    const label = texts.find((t) => t !== severityWord && !/^no override$/i.test(t) && !/^payment method/i.test(t));
    expect(label, `${where}: flag ${i + 1} label element`).toBeTruthy();
    expect(label!.startsWith(severityWord), `${where}: flag ${i + 1} severity is not run into the label (${label})`).toBe(false);
    const override = item.locator("span").filter({ hasText: /no override/i });
    if ((await override.count()) > 0) {
      await expect(override, `${where}: flag ${i + 1} no-override note is one element`).toHaveCount(1);
      expect(((await override.textContent()) ?? "").trim(), `${where}: flag ${i + 1} no-override note is its own element`).toMatch(/^(payment method, )?no override$/i);
    }
  }
}

const finished = ALL_FIXTURES.map((f) => [f.id, f] as const);

test.describe("finished demo deals, desktop and phone", () => {
  test.skip(!WEB_PRESENT, "apps/web is not on this branch yet, nothing to load");

  for (const [id, fixture] of finished) {
    for (const size of WIDTHS) {
      test(`${id} at ${size.width}px: deal room and evidence page`, async ({ page }, testInfo) => {
        testInfo.setTimeout(180_000);
        await page.setViewportSize({ width: size.width, height: size.height });

        // The landing page links to the seeded finished deal for this scenario.
        await page.goto("/");
        const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: fixture.name }) });
        const link = card.getByRole("link", { name: "See the finished deal" });
        await expect(link, `${id}: the landing page offers the finished deal`).toBeVisible();
        const href = (await link.getAttribute("href"))!;
        const dealId = /\/deals\/([^/?]+)/.exec(href)?.[1];
        expect(dealId, `${id}: finished deal link ${href}`).toBeTruthy();

        // Deal room.
        await page.goto(href);
        await waitForHydration(page);
        await expect(page.getByRole("banner").getByText(STATE_LABEL[fixture.deal.state], { exact: true })).toBeVisible();
        const roomShot = await shoot(page, `${id}-deal-${size.name}`);
        await expectNoHorizontalScroll(page, `${id} deal room at ${size.width}px (${roomShot})`);
        await expectNoEmptyPanels(page, `${id} deal room at ${size.width}px (${roomShot})`);
        const flags = page.getByRole("list", { name: "Red flags" });
        if ((await flags.count()) > 0) await expectSeparateFlagBadges(flags, `${id} deal room at ${size.width}px (${roomShot})`);

        // PLAN item 10: the hash chain chip in the header, computed on render. A seeded deal never shows the warning.
        const header = page.getByRole("banner");
        await expect(header.getByText(/History does not match|History chain is broken/)).toHaveCount(0);
        // The chip carries a small "chain" label beside its text, so match the sentence, not the whole element.
        if (fixture.payment) {
          await expect(header.getByText(/History unchanged since PayPal order/)).toBeVisible();
        } else {
          await expect(header.getByText(/History hash-chained, \d+ events?/)).toBeVisible();
        }

        // Evidence page: a pack can exist where the card was locked; the fake slab never got that far.
        // Two assertions below are red until REVIEW.md 2026-10-07 entries land (builder-web): the clean deal's
        // build answers 500 because seeded events sit at future fixture dates, and at 390 px the summary's
        // deal-id#hash token forces a horizontal scroll.
        await page.goto(`/deals/${dealId}/evidence?as=buyer`);
        await waitForHydration(page);
        if (fixture.deal.lockedCardVersion) {
          // The clean deal ends without a pack (nothing went wrong); either side builds one on this page.
          const build = page.getByRole("button", { name: "Build the evidence pack" });
          if ((await build.count()) > 0) {
            await build.click();
            await expect(page.getByText("Pay Pals evidence pack")).toBeVisible({ timeout: 60_000 });
          }
        }
        const evidenceShot = await shoot(page, `${id}-evidence-${size.name}`);
        await expectNoHorizontalScroll(page, `${id} evidence page at ${size.width}px (${evidenceShot})`);
        if (fixture.deal.lockedCardVersion) {
          await expect(page.getByText("Pay Pals evidence pack")).toBeVisible();
          await expect(page.getByText(`Deal state: ${STATE_LABEL[fixture.deal.state]}`, { exact: false })).toBeVisible();
          await expectNoEmptyPanels(page, `${id} evidence page at ${size.width}px (${evidenceShot})`);
          const history = page.locator("section").filter({ has: page.getByRole("heading", { name: "Tamper-evident history" }) });
          await expect(history).toBeVisible();
          if (fixture.payment) {
            await expect(history).toContainText(`${dealId}#`);
            await expect(history).not.toContainText(/Does not verify|do not reproduce/);
            // The badge and the sentence may both say so; at least one element must.
            await expect(history.getByText(/Verified: the stored events reproduce this hash\.|History unchanged since PayPal order/).first()).toBeVisible();
          }
        } else {
          await expect(page.getByRole("heading", { name: "No evidence pack yet" })).toBeVisible();
          await expect(page.getByText("never got that far", { exact: false })).toBeVisible();
        }
      });
    }
  }
});
