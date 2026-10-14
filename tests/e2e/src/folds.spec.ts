/**
 * The design pass (Matt, Oct 13): "the site still reads as walls of text". Hard word budgets, with
 * every honest statement moved and none deleted.
 *
 * This spec uses the plain Playwright test, not the fixtures one, so the deal room is as a visitor
 * first sees it: sections closed. It pins three things:
 *   1. the budgets, counted by the same function the budget script prints (src/word-count.ts),
 *   2. that the sections start closed on a finished deal and one tap opens each,
 *   3. that the statements the design moved are each one tap away, never gone: a flag's evidence
 *      quote from its chip, the D9 sentence and the demo PSA label from the cert check, the
 *      example-deal label, "useful context for a dispute", and the PayPal order line on the card.
 * Fixtures only, no keys.
 */
import { expect, test, type Page } from "@playwright/test";
import { ALL_FIXTURES, cleanPs5, emptyBox, fakeSlab } from "@pay-pals/contracts";
import { WEB_PRESENT } from "./env";
import { expectNoHorizontalScroll, waitForHydration } from "./helpers";
import { finishedDeal } from "./layout-helpers";
import { LANDING_BUDGET, ROOM_BUDGET, visibleWords } from "./word-count";

async function openFinished(page: Page, fixture: (typeof ALL_FIXTURES)[number], as: "buyer" | "seller" = "buyer"): Promise<void> {
  const { href } = await finishedDeal(page, fixture);
  await page.goto(href.replace("as=buyer", `as=${as}`));
  await waitForHydration(page);
  await page.waitForLoadState("networkidle");
}

test.describe("word budgets and folds", () => {
  test.skip(!WEB_PRESENT, "apps/web is not on this branch yet, nothing to load");

  test("the landing page is at most 250 words", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await waitForHydration(page);
    const words = await visibleWords(page, false);
    expect(words.length, `landing words: ${words.join(" ")}`).toBeLessThanOrEqual(LANDING_BUDGET);
  });

  for (const fixture of ALL_FIXTURES) {
    test(`${fixture.id}: the finished room's first screen at 1280 is at most 60 words`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await openFinished(page, fixture);
      const words = await visibleWords(page, true);
      expect(words.length, `first screen: ${words.join(" ")}`).toBeLessThanOrEqual(ROOM_BUDGET);
    });
  }

  test("a finished room starts with every section closed, and one tap opens one", async ({ page }) => {
    await openFinished(page, cleanPs5);
    const folds = page.locator("[data-fold] > details");
    expect(await folds.count()).toBeGreaterThanOrEqual(5);
    await expect(page.locator("[data-fold] > details[open]")).toHaveCount(0);
    // Counts are on the labels: "Pal's work 5", "Chat 10".
    await expect(page.getByTestId("room-sections").getByRole("heading", { name: "Chat", exact: true })).toBeVisible();
    await expect(page.getByTestId("room-sections").locator("summary", { hasText: "Chat" }).getByTestId("fold-count")).toContainText(/\d+/);
    await expect(page.getByRole("heading", { name: "Deal chat", exact: true })).toBeHidden();
    await page.getByTestId("room-sections").locator("summary", { hasText: "Chat" }).click();
    await expect(page.getByRole("heading", { name: "Deal chat", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Buyer Pal", exact: true })).toBeVisible();
  });

  test("a stop flag's evidence quote is one tap from its chip", async ({ page }) => {
    await openFinished(page, fakeSlab);
    const chip = page.getByTestId("verdict-chip").filter({ hasText: "Friends and Family" });
    await expect(chip).toBeVisible();
    await expect(page.getByTestId("flag-evidence").first()).toBeHidden();
    await chip.click();
    const quote = page.getByTestId("verdict-chip-detail").getByTestId("flag-evidence");
    await expect(quote.first()).toBeVisible();
    await expect(quote.first()).toContainText("Seller wrote");
    await chip.click();
    await expect(quote.first()).toBeHidden();
  });

  test("the cert check keeps D9 and the demo record label, one tap away", async ({ page }) => {
    await openFinished(page, fakeSlab);
    const cert = page.getByTestId("cert-check");
    await expect(cert).toBeHidden();
    await page.locator("summary", { hasText: "Cert check" }).click();
    await expect(cert).toBeVisible();
    await expect(cert.getByTestId("cert-headline")).toContainText(/doesn't prove the seller has it/);
    await expect(cert.getByTestId("cert-headline")).toContainText(/demo PSA record/i);
  });

  test("the example-deal label is one tap from the Example chip", async ({ page }) => {
    await openFinished(page, emptyBox);
    await expect(page.getByTestId("example-label")).toBeHidden();
    await page.getByTestId("example-chip").click();
    await expect(page.getByTestId("example-label")).toContainText("Example deal, seeded from a scenario");
  });

  test("what an issue means, with 'useful context for a dispute', is behind Details", async ({ page }) => {
    await openFinished(page, emptyBox);
    const note = page.getByTestId("ending-note");
    await expect(note.getByText(/useful context for a PayPal dispute/)).toBeHidden();
    await note.locator("summary").click();
    await expect(note.getByText(/useful context for a PayPal dispute/)).toBeVisible();
  });

  test("the PayPal order line stays on the item card once it is locked, and opens the order text", async ({ page }) => {
    await openFinished(page, cleanPs5);
    const glance = page.getByTestId("item-glance");
    await expect(glance.getByText("On the PayPal order")).toBeVisible();
    await expect(page.getByTestId("order-text")).toBeHidden();
    await glance.getByTestId("glance-order-line").click();
    await expect(page.getByTestId("order-text")).toBeVisible();
    await expect(page.getByTestId("order-text")).toContainText("On the PayPal order");
  });

  test("landing: Matt's hero line, the demo cards under it, and the protection form folded behind one button", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await waitForHydration(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Don't get scammed buying from strangers.");
    await expect(page.getByText("Two AI pals check the photos, the cert and the chat before you pay.")).toBeVisible();
    const demo = await page.getByRole("heading", { name: "Try a demo deal" }).boundingBox();
    const how = await page.getByRole("heading", { name: "How a deal goes" }).boundingBox();
    const hero = await page.getByRole("heading", { level: 1 }).boundingBox();
    expect(demo!.y, "the demo cards come right after the hero").toBeGreaterThan(hero!.y);
    expect(demo!.y, "and before how a deal goes").toBeLessThan(how!.y);
    await expect(page.getByRole("form", { name: "Use Pay Pals Protection" })).toHaveCount(0);
    await page.getByRole("button", { name: "Start a protected deal" }).click();
    await expect(page.getByRole("form", { name: "Use Pay Pals Protection" })).toBeVisible();
    await expect(page.getByTestId("built-chain")).toHaveText("Tamper-proof history");
  });

  test("the stolen-photo room: the stop flag leads, no price chip, no empty band, Never locked, the status in words", async ({ page }) => {
    await openFinished(page, fakeSlab);
    const chips = page.getByTestId("verdict-chip");
    await expect(chips.first()).toHaveAttribute("data-tone", "stop");
    await expect(chips.first()).toHaveAttribute("data-kind", "flag");
    expect(await chips.evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")))).not.toContain("price");
    await expect(page.getByTestId("price-line-card")).toHaveCount(0);
    await expect(page.getByTestId("glance-version")).toHaveText("Never locked");
    await expect(page.getByTestId("progress-status")).toHaveText("Stopped at Reviewed");
    // The card closes the gap: it ends where its content ends, not where the item card ends.
    const verdict = await page.getByTestId("verdict").boundingBox();
    const glance = await page.getByTestId("item-glance").boundingBox();
    expect(verdict!.height).toBeLessThan(glance!.height);
  });

  for (const [fixture, status] of [
    [cleanPs5, "Arrived"],
    [emptyBox, "Issue at Arrived"],
  ] as const) {
    test(`${fixture.id}: the price line is on the first screen, from the real price check`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await openFinished(page, fixture);
      const line = page.getByTestId("price-line-card");
      await expect(line).toBeVisible();
      await expect(line).toContainText(/Asking \$\d+\.\d\d, new at retail \$499\.00, demo prices\./);
      await expect(line.getByText("Show the listings")).toBeVisible();
      await expect(page.getByTestId("verdict-chip").filter({ hasText: "Fair used price" })).toBeVisible();
      await expect(page.getByTestId("progress-status")).toHaveText(status);
      // One tap on the price chip opens the same line, in place, under the chips.
      await page.getByTestId("verdict-chip").filter({ hasText: "Fair used price" }).click();
      await expect(page.getByTestId("price-line-chip")).toBeVisible();
    });
  }

  test("every segment of the progress bar is named, and the status is not colour alone", async ({ page }) => {
    await openFinished(page, cleanPs5);
    const segments = page.getByTestId("progress-dots").getByRole("listitem");
    await expect(segments).toHaveCount(7);
    expect((await segments.allTextContents()).map((t) => t.split(",")[0])).toEqual(["Invited", "Card", "Reviewed", "Agreed", "Paid", "Shipped", "Arrived"]);
    await expect(page.getByTestId("progress-dots")).toHaveAccessibleName(/Deal progress: Arrived/);
  });

  test("a finished room works at 390 px: no sideways scroll, every tap target at least 44 px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const fixture of ALL_FIXTURES) {
      await openFinished(page, fixture);
      await expectNoHorizontalScroll(page, `${fixture.id} room at 390`);
      const short = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('a[href], button, summary, [role="button"], [role="tab"]'))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0 || !el.checkVisibility()) continue;
          if (r.height + 0.5 < 44) out.push(`<${el.tagName.toLowerCase()}> ${Math.round(r.height)} px "${(el.textContent ?? "").trim().slice(0, 40)}"`);
        }
        return out;
      });
      expect(short, `${fixture.id}: ${short.join("; ")}`).toEqual([]);
    }
  });
});
