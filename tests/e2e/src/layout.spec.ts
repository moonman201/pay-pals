/**
 * The visual-pass layout (PLAN items 4 to 9) on the three finished demo
 * deals and the landing cards: the progress stepper and its end badge, the
 * verdict block with the Buyer Pal's word said once, the cert and arrival
 * comparisons with mismatched rows marked, the locked card with its order
 * text, the history chip, and the scenario cards' outcome marks.
 * Fixtures only, no keys.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { ALL_FIXTURES, FAKE_SLAB_CERT, cleanPs5, emptyBox, fakeSlab, type ScenarioFixture } from "@pay-pals/contracts";
import { WEB_PRESENT } from "./env";
import { panel, waitForHydration } from "./helpers";
import { finishedDeal } from "./layout-helpers";

const STEP_LABELS = ["Invited", "Card built", "Reviewed", "Agreed and locked", "Paid", "Shipped", "Arrived"];
/**
 * The verdict is a short headline now, not a single word: "Stop. Don't
 * pay.", "Careful. Ask first.", "Looks good." So the spec stops restating
 * the copy and pins the rules instead, which is what Matt's pass was for:
 * the block carries the verdict as data, there is exactly one headline,
 * and it is at most three words.
 */
type Overall = "go" | "caution" | "stop";
const MAX_HEADLINE_WORDS = 3;

async function openFinished(page: Page, fixture: ScenarioFixture): Promise<string> {
  const { href, dealId } = await finishedDeal(page, fixture);
  await page.goto(href);
  await waitForHydration(page);
  return dealId;
}

/**
 * The stepper's steps in order, with their statuses. All seven by default; a deal that ended early
 * lists only the steps it reached, and the rest are one "Not reached" line (see the fake-slab test).
 */
async function stepStatuses(page: Page, labels: readonly string[] = STEP_LABELS): Promise<string[]> {
  const steps = page.getByTestId("progress-stepper").getByRole("listitem");
  await expect(steps).toHaveCount(labels.length);
  await expect(steps).toHaveText(labels.map((label) => new RegExp(label)));
  return steps.evaluateAll((items) => items.map((li) => li.getAttribute("data-status") ?? ""));
}

/** The verdict block carries the overall as data, and the panel says the word exactly once, with no badge in its heading. */
async function expectVerdictBlock(page: Page, overall: Overall): Promise<Locator> {
  const review = panel(page, "Buyer Pal review");
  await expect(review.getByRole("heading").first()).toHaveText("Buyer Pal review");
  const verdict = review.getByTestId("verdict");
  await expect(verdict).toHaveAttribute("data-overall", overall);
  await expect(verdict.locator("img[data-pal='buyer']")).toBeVisible();
  const headline = verdict.getByTestId("verdict-headline");
  await expect(headline, "the verdict is said once").toHaveCount(1);
  const words = ((await headline.textContent()) ?? "").trim().split(/\s+/).filter(Boolean);
  expect(words.length, `the verdict headline says something: "${words.join(" ")}"`).toBeGreaterThan(0);
  expect(words.length, `the verdict headline is at most ${MAX_HEADLINE_WORDS} words: "${words.join(" ")}"`).toBeLessThanOrEqual(MAX_HEADLINE_WORDS);
  return review;
}

test.describe("new layout on the finished deals", () => {
  test.skip(!WEB_PRESENT, "apps/web is not on this branch yet, nothing to load");

  test("fake slab: three steps done, Blocked end badge, Stop verdict, cert rows that match, no lock", async ({ page }) => {
    await openFinished(page, fakeSlab);
    // 2026-10-13: the stepper used to list four upcoming steps a blocked deal can never reach. It now lists
    // the three it reached, the Blocked badge after them, and one "Not reached" line for the rest. The old
    // expectation predates that change; it was not a sign of a regression.
    expect(await stepStatuses(page, STEP_LABELS.slice(0, 3))).toEqual(["done", "done", "done"]);
    await expect(page.getByTestId("progress-not-reached")).toHaveText("Not reached: Agreed and locked, Paid, Shipped and Arrived.");
    await expect(page.getByTestId("progress-stepper").locator("[aria-current='step']")).toHaveCount(0);
    await expect(page.getByTestId("progress-end")).toHaveText("Blocked");

    const review = await expectVerdictBlock(page, fakeSlab.expectedVerdict.overall);
    // The cert is real: the comparison agrees row by row, and the stop stands on the other flags.
    // The cert block says the finding in one line now, and it says more than "matches": a
    // matching record shows the slab exists and not that this seller holds it, which is the
    // D9 sentence. Pin that the headline names the cert and makes both halves of the point.
    const cert = page.getByTestId("cert-check");
    await expect(cert).toBeVisible();
    const certHeadline = cert.getByTestId("cert-headline");
    await expect(certHeadline).toContainText(FAKE_SLAB_CERT);
    await expect(certHeadline).toContainText(/matches/i);
    await expect(certHeadline, "a matching cert never claims the seller has it").toContainText(/doesn't prove|does not prove|not a check/i);
    const rows = cert.getByTestId("comparison").locator("tbody").getByRole("row");
    expect(await rows.count()).toBeGreaterThan(0);
    await expect(cert.getByTestId("comparison").getByRole("columnheader", { name: "Card says" })).toBeVisible();
    await expect(cert.getByTestId("comparison").getByRole("columnheader", { name: /PSA.*says/ })).toBeVisible();
    const statuses = await rows.evaluateAll((trs) => trs.map((tr) => tr.getAttribute("data-status")));
    expect(statuses, "no cert row is a mismatch").not.toContain("mismatch");
    expect(statuses, "the cert rows are compared, not left unknown").toContain("match");

    await expect(page.getByTestId("lock-badge")).toHaveCount(0);
    await expect(page.getByTestId("order-text")).toHaveCount(0);
    await expect(page.getByTestId("history-badge").first()).toHaveAttribute("data-status", "unanchored");
  });

  test("clean deal: every step done, Go verdict, arrival rows all match, card locked with its order text", async ({ page }) => {
    const dealId = await openFinished(page, cleanPs5);
    expect(await stepStatuses(page)).toEqual(Array(7).fill("done"));
    await expect(page.getByTestId("progress-end")).toHaveCount(0);

    await expectVerdictBlock(page, cleanPs5.expectedVerdict.overall);

    const arrival = panel(page, "Arrival check");
    const table = arrival.getByTestId("comparison");
    await expect(table.getByRole("columnheader", { name: "Locked card" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "What arrived" })).toBeVisible();
    const statuses = await table.locator("tbody tr").evaluateAll((trs) => trs.map((tr) => tr.getAttribute("data-status")));
    expect(statuses.length).toBeGreaterThanOrEqual(3);
    expect(statuses.filter((s) => s === "mismatch")).toEqual([]);
    // What the pal could read off the arrival photos matches; what it could not stays neutral, never red.
    expect(statuses.filter((s) => s === "match").length).toBeGreaterThanOrEqual(1);
    const serialRow = table.locator("tbody tr").filter({ hasText: "serial" }).first();
    await expect(serialRow).toHaveAttribute("data-status", "match");
    await expect(serialRow).toContainText(cleanPs5.cards.at(-1)!.serial!);

    const card = panel(page, "Item card");
    await expect(card.getByTestId("lock-badge")).toHaveText(new RegExp(`Locked, version ${cleanPs5.deal.lockedCardVersion}`));
    const locked = cleanPs5.cards.find((c) => c.version === cleanPs5.deal.lockedCardVersion)!;
    const order = card.getByTestId("order-text");
    await expect(order).toContainText("On the PayPal order");
    await expect(order).toContainText(locked.title);
    await expect(order).toContainText(`Serial ${locked.serial}`);
    await expect(order).toContainText(`Invoice ${dealId}`);
    await expect(page.getByTestId("history-badge").first()).toHaveAttribute("data-status", "unanchored");
  });

  test("empty box: every step done, Issue open end badge, the missing item marked as the mismatch", async ({ page }) => {
    await openFinished(page, emptyBox);
    expect(await stepStatuses(page)).toEqual(Array(7).fill("done"));
    await expect(page.getByTestId("progress-end")).toHaveText("Issue open");

    await expectVerdictBlock(page, emptyBox.expectedVerdict.overall);

    // The locked card never gained a console serial, so no serial row can be wrong: what is missing is the item.
    const table = panel(page, "Arrival check").getByTestId("comparison");
    for (const field of emptyBox.expectedArrival!.mismatchFields) {
      await expect(table.locator(`tbody tr[data-status='mismatch']`).filter({ hasText: field })).not.toHaveCount(0);
    }
    await expect(table.locator("tbody tr[data-status='mismatch']").filter({ hasText: "other" })).toHaveCount(1);
    // The serial row still shows, as nothing to compare rather than as a contradiction.
    await expect(table.locator("tbody tr").filter({ hasText: "serial" })).toHaveAttribute("data-status", "unknown");
    await expect(panel(page, "Item card").getByTestId("lock-badge")).toContainText("Locked");
  });

  /**
   * The pages must not depend on whether this checkout has a .env.local. The
   * sandbox seller account is the one that reaches the rendered page: with it
   * set, demo deals pay a longer address than the fixture's, which wraps
   * differently and moves every visual baseline. The config pins the server's
   * environment; this proves the server under test took the pinning.
   */
  test("the finished deals pay the fixture payee, not a sandbox account", async ({ page }) => {
    for (const fixture of ALL_FIXTURES) {
      const { href } = await finishedDeal(page, fixture);
      await page.goto(href);
      await waitForHydration(page);
      const body = (await page.locator("body").textContent()) ?? "";
      const payee = fixture.cards[fixture.cards.length - 1]!.sellerPaypalEmail;
      expect(body, `${fixture.id}: the item card pays the fixture payee`).toContain(payee);
      expect(body, `${fixture.id}: no sandbox account address on the page`).not.toMatch(/@personal\.example\.com|@business\.example\.com|\bsb-[a-z0-9]+@/i);
    }
  });

  test("landing cards: outcome mark and both pals on each, no scenario numbering", async ({ page }) => {
    await page.goto("/");
    const outcome: Record<ScenarioFixture["id"], string> = { "fake-slab": "blocked", "clean-ps5": "complete", "empty-box": "issue" };
    await expect(page.getByText(/^Scenario \d/)).toHaveCount(0);
    for (const fixture of ALL_FIXTURES) {
      const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: fixture.name }) });
      await expect(card.locator("[data-outcome]")).toHaveAttribute("data-outcome", outcome[fixture.id]);
      await expect(card.locator("img[data-pal='buyer']")).toBeVisible();
      await expect(card.locator("img[data-pal='seller']")).toBeVisible();
      await expect(card.getByRole("button", { name: "Play as buyer" })).toBeVisible();
      await expect(card.getByRole("button", { name: "Play as seller" })).toBeVisible();
    }
  });
});
