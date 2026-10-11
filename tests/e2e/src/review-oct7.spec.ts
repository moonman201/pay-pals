/**
 * Live site review, Oct 7, PLAN item 15: the three finished demo deals from
 * the landing page's "See the finished deal" links, and their evidence
 * pages, at desktop (1280) and phone (390) width. Each page is screenshotted
 * into screenshots/review-oct7/ (gitignored) and checked for horizontal
 * scroll, empty panels, the state badge, and flag badges that are separate
 * elements. Judge walk, Oct 8: the seeded deals are labelled as examples
 * (J6), no range has equal ends (J4), and every caption shows once (J8).
 * Fixtures only, no keys.
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { ALL_FIXTURES } from "@pay-pals/contracts";
import type { ScenarioFixture } from "@pay-pals/contracts";
import { STARTS_SERVER, WEB_PRESENT } from "./env";
import { expectNoHorizontalScroll, snapshot, timelineItems, waitForHydration } from "./helpers";
import { finishedDeal } from "./layout-helpers";

/** Against a server we did not start (E2E_BASE_URL, for example production) the pass is read-only: no evidence build. */
const REMOTE = !STARTS_SERVER;
const SHOTS = resolve(dirname(fileURLToPath(import.meta.url)), "..", "screenshots", REMOTE ? "review-oct7-production" : "review-oct7");

/** Sentences that must never reach a page (Oct 7 item 1, judge walk J4). */
const FORBIDDEN_PAGE_TEXT = [/could not open the photo files/i, /went by the photo descriptions/i, /\$0 to \$0/, /\$(\d[\d,]*(?:\.\d+)?) to \$\1\b/];
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

/**
 * J8: a photo shows its description once. A loaded photo carries it in a
 * figcaption, a thumbnail too small for one carries it in the image's alt
 * text, and a photo that did not load carries it in the placeholder. Never
 * twice, and never nowhere.
 */
async function expectCaptionsOnce(page: Page, where: string): Promise<void> {
  const figures = page.locator("figure");
  for (let i = 0; i < (await figures.count()); i++) {
    const figure = figures.nth(i);
    const captions = figure.locator("figcaption");
    const count = await captions.count();
    expect(count, `${where}: figure ${i + 1} has at most one caption`).toBeLessThanOrEqual(1);
    if (count === 0) {
      // A thumbnail: the description must still be there for a screen reader.
      const alt = await figure.locator("img").first().getAttribute("alt");
      expect((alt ?? "").trim().length, `${where}: figure ${i + 1} has no caption, so its image needs alt text`).toBeGreaterThan(0);
      continue;
    }
    const caption = ((await captions.first().textContent()) ?? "").trim();
    if (caption) expect(((await figure.textContent()) ?? "").trim(), `${where}: figure ${i + 1} caption appears once`).toBe(caption);
  }
  const placeholders = page.getByTestId("photo-placeholder");
  for (let i = 0; i < (await placeholders.count()); i++) {
    const box = placeholders.nth(i);
    const label = ((await box.getAttribute("aria-label")) ?? "").trim();
    const text = ((await box.textContent()) ?? "").trim();
    expect(text === label || text === "Photo", `${where}: placeholder ${i + 1} shows its caption once (${text})`).toBe(true);
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

        // The landing links by scenario and the helper follows it, so the id is known only after
        // the redirect. It used to be parsed out of the href, which is the coupling that made a
        // cached landing page point at a deal that a re-seed had deleted.
        const { dealId } = await finishedDeal(page, fixture);

        // Deal room: already open, the link landed on it.
        await waitForHydration(page);
        await expect(page.getByRole("banner").getByText(STATE_LABEL[fixture.deal.state], { exact: true })).toBeVisible();
        const roomShot = await shoot(page, `${id}-deal-${size.name}`);
        await expectNoHorizontalScroll(page, `${id} deal room at ${size.width}px (${roomShot})`);
        await expectNoEmptyPanels(page, `${id} deal room at ${size.width}px (${roomShot})`);
        const flags = page.getByRole("list", { name: "Red flags" });
        if ((await flags.count()) > 0) await expectSeparateFlagBadges(flags, `${id} deal room at ${size.width}px (${roomShot})`);

        // PLAN item 10 and J6: the finished demo deals are seeded examples. The header says so, the chain chip
        // reads as chained but not anchored, and nothing claims PayPal holds the hash. Never the warning.
        const header = page.getByRole("banner");
        await expect(header.getByText(/History does not match|History chain is broken/)).toHaveCount(0);
        await expect(header.getByText("Example deal, seeded from a scenario")).toBeVisible();
        await expect(header.getByText(/Tamper-evident history, \d+ events? \(example deal, no PayPal order\)/)).toBeVisible();
        await expect(header.getByText(/History unchanged since PayPal order/)).toHaveCount(0);
        if (fixture.payment) {
          const payment = page.locator("section").filter({ has: page.getByRole("heading", { name: "Payment" }) });
          await expect(payment.getByText("Example order id", { exact: true })).toBeVisible();
          await expect(payment.getByText(/no PayPal order was created/)).toBeVisible();
          await expect(payment.getByText("PayPal order", { exact: true })).toHaveCount(0);
        }

        // Oct 7 item 1 and J4: no caption-fallback sentence, no zero or equal-ended range, anywhere on the page.
        const roomText = (await page.locator("body").textContent()) ?? "";
        for (const pattern of FORBIDDEN_PAGE_TEXT) expect(roomText, `${id} deal room at ${size.width}px must not match ${pattern}`).not.toMatch(pattern);

        // J8: every photo shows its caption once. Buyer-started deals show the new invite wording.
        await expectCaptionsOnce(page, `${id} deal room at ${size.width}px (${roomShot})`);
        const timeline = await timelineItems(page);
        if (fixture.deal.startedBy === "buyer") {
          await expect(timeline.filter({ hasText: "Invite link created for the seller" })).toHaveCount(1);
          await expect(timeline.filter({ hasText: "Invite sent to the seller's PayPal email" })).toHaveCount(0);
        }

        // Item 7: the seeded dates run in order and the story ended before now (read-only GET).
        const snap = await snapshot(page, dealId);
        const ats = snap.events.map((e) => Date.parse(e.at));
        expect(ats.length, `${id}: events`).toBeGreaterThan(0);
        for (let i = 1; i < ats.length; i++) expect(ats[i], `${id}: event ${i + 1} (${snap.events[i]!.kind}) is not before event ${i}`).toBeGreaterThanOrEqual(ats[i - 1]!);
        expect(ats[ats.length - 1], `${id}: the last event ${snap.events[ats.length - 1]!.at} is before now`).toBeLessThan(Date.now());
        if (snap.payment?.createdAt) expect(Date.parse(snap.payment.createdAt), `${id}: payment created before now`).toBeLessThan(Date.now());
        expect(snap.deal.state).toBe(fixture.deal.state);

        // Evidence page: a pack can exist where the card was locked; the fake slab never got that far.
        // This pass reads the seeded deals and never changes them: building a pack appends a pal message
        // and a timeline event, which would move the visual baselines of whichever spec screenshots next.
        // The empty box is seeded with a pack, so the built page is still covered; clean-deal.spec builds
        // one end to end on a deal of its own. Whoever built the clean deal's pack first, this accepts both.
        await page.goto(`/deals/${dealId}/evidence?as=buyer`);
        await waitForHydration(page);
        let built = Boolean(fixture.deal.lockedCardVersion);
        if (built && (await page.getByRole("button", { name: "Build the evidence pack" }).count()) > 0) built = false;
        const evidenceShot = await shoot(page, `${id}-evidence-${size.name}`);
        await expectNoHorizontalScroll(page, `${id} evidence page at ${size.width}px (${evidenceShot})`);
        const evidenceText = (await page.locator("body").textContent()) ?? "";
        for (const pattern of FORBIDDEN_PAGE_TEXT) expect(evidenceText, `${id} evidence page at ${size.width}px must not match ${pattern}`).not.toMatch(pattern);
        if (fixture.deal.lockedCardVersion && !built) {
          await expect(page.getByRole("heading", { name: "No evidence pack yet" })).toBeVisible();
          await expect(page.getByRole("button", { name: "Build the evidence pack" })).toBeVisible();
        } else if (fixture.deal.lockedCardVersion) {
          await expect(page.getByText("Pay Pals evidence pack")).toBeVisible();
          await expect(page.getByText(`Deal state: ${STATE_LABEL[fixture.deal.state]}`, { exact: false })).toBeVisible();
          await expectNoEmptyPanels(page, `${id} evidence page at ${size.width}px (${evidenceShot})`);
          const history = page.locator("section").filter({ has: page.getByRole("heading", { name: "Tamper-evident history" }) });
          await expect(history).toBeVisible();
          // J6: a seeded example says its chain is intact but not anchored in a PayPal order; it never claims verified.
          await expect(page.getByText("Example deal, seeded from a scenario").first()).toBeVisible();
          await expect(history).toContainText(/\(example deal, no PayPal order\)/);
          await expect(history).toContainText("the payment ids are placeholders");
          await expect(history).not.toContainText(/Does not verify|do not reproduce|PayPal's own record holds it|Verified: the stored events/);
          if (fixture.payment) {
            const paymentSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "Payment" }) });
            await expect(paymentSection).toContainText(`Example order id ${fixture.payment.paypalOrderId}`);
          }
          await expectCaptionsOnce(page, `${id} evidence page at ${size.width}px (${evidenceShot})`);
        } else {
          await expect(page.getByRole("heading", { name: "No evidence pack yet" })).toBeVisible();
          await expect(page.getByText("never got that far", { exact: false })).toBeVisible();
        }
      });
    }
  }
});
