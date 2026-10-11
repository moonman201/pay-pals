/**
 * The signature view (item E12): the Deal status panel on the three
 * finished demo deals, where every line is labelled Verified, Unverified or
 * Missing.
 *
 * Nothing touched this view end to end before, and its unit test only
 * checked that the three counts add up and that Verified is above zero, so
 * a reported "8 verified, 9 unverified, 1 missing" had nothing pinning it
 * and did not reproduce.
 *
 * Counts are not what this pins. A count has to be edited by the next lane
 * that adds a row, so it trains people to edit the number, and the number
 * was never the promise the view makes. The promise is in the three labels:
 *
 *   - Verified never stands alone. Every Verified line's own sentence names
 *     the comparison it passed, and no Verified line says in its own words
 *     that nothing was checked.
 *   - The two deliberate Unverifieds stay Unverified and keep saying why:
 *     the carrier tracking number, which Pay Pals does not query, and the
 *     buyer's own word that the package arrived.
 *   - The chip a row shows agrees with the status it carries.
 *   - The legend that stops "Verified" being read as a claim about the item
 *     is above the rows.
 *
 * Every row is printed, so a reviewer reading a failure sees the whole view
 * rather than one assertion. Fixtures only, no keys.
 */
import { expect, test, type Page } from "@playwright/test";
import { ALL_FIXTURES } from "@pay-pals/contracts";
import { WEB_PRESENT } from "./env";
import { panel, waitForHydration, waitForReviewIdle } from "./helpers";

interface StatusRow {
  group: string;
  label: string;
  status: string;
  chip: string;
  detail: string;
}

const CHIP_WORD: Record<string, string> = { verified: "Verified", unverified: "Unverified", missing: "Missing" };

/**
 * A Verified line has to name the comparison it passed. These are the words
 * the view uses to join the two sides of one. This is a proxy for "it names
 * both sides", which no regular expression can check, and it catches the
 * failure that matters: a line that claims a check passed while its own
 * sentence names nothing it was checked against.
 */
const NAMES_A_COMPARISON = /\bcompar(e|es|ed|ison)\b|\bmatch(es|ed|ing)?\b|\bagree(s|d)?\b|\bagainst\b|\bthe same\b|\bidentical\b|\breproduce[sd]?\b/i;

/** A Verified line that says this about itself is contradicting its own label. */
const DENIES_A_CHECK = /\bnothing (has been|was) checked\b|\bhas not been checked\b|\bcould not be compared\b|\bnothing to compare\b|\bdid not (read|check)\b|\bno(t)? a live\b/i;

/** Every row of the Deal status panel, with the group it sits in. */
async function statusRows(page: Page): Promise<StatusRow[]> {
  return page.getByTestId("status-group").evaluateAll((groups) =>
    groups.flatMap((group) => {
      const title = group.querySelector("p")?.textContent?.trim() ?? "";
      return Array.from(group.querySelectorAll('[data-testid="status-item"]')).map((item) => ({
        group: title,
        label: item.querySelector("span")?.textContent?.trim() ?? "",
        status: item.getAttribute("data-status") ?? "",
        chip: item.querySelector('[data-testid="status-chip"]')?.textContent?.trim() ?? "",
        detail: item.querySelector("p")?.textContent?.trim() ?? "",
      }));
    }),
  );
}

/** The finished seeded deal the landing page offers for a scenario. */
async function openFinishedDeal(page: Page, name: string): Promise<void> {
  await page.goto("/");
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name }) });
  const link = card.getByRole("link", { name: "See the finished deal" });
  await expect(link, `the landing page offers the finished ${name} deal`).toBeVisible();
  await page.goto((await link.getAttribute("href"))!);
  await waitForHydration(page);
  // The review streams, and a half-filled one would give a different set of rows.
  await waitForReviewIdle(page);
}

test.describe("the deal status view", () => {
  test.skip(!WEB_PRESENT, "apps/web is not on this branch yet, nothing to load");

  for (const fixture of ALL_FIXTURES) {
    test(`${fixture.id}: a Verified line names the comparison it passed`, async ({ page }) => {
      await openFinishedDeal(page, fixture.name);

      const status = panel(page, "Deal status");
      await expect(status, `${fixture.id}: the deal room shows the status view`).toBeVisible();
      await expect(status.getByTestId("status-legend")).toContainText("It never means the item is genuine or that the seller owns it.");

      const rows = await statusRows(page);
      console.log(`${fixture.id}: ${rows.length} status rows\n${rows.map((r) => `  [${r.status}] ${r.group} / ${r.label}: ${r.detail}`).join("\n")}`);
      expect(rows.length, `${fixture.id}: the view has rows`).toBeGreaterThan(0);

      for (const row of rows) {
        expect(Object.keys(CHIP_WORD), `${fixture.id}: "${row.label}" carries one of the three labels`).toContain(row.status);
        expect(row.chip, `${fixture.id}: "${row.label}" shows the chip for its own status`).toBe(CHIP_WORD[row.status]);
        expect(row.detail.length, `${fixture.id}: "${row.label}" says something`).toBeGreaterThan(0);
      }

      // The denial guard below is only worth anything if its words are words this view really uses.
      // They are, on the lines that honestly say nothing was checked, so a Verified line carrying
      // one of them would be contradicting itself rather than tripping a pattern that never matches.
      expect(
        rows.filter((r) => DENIES_A_CHECK.test(r.detail)).length,
        `${fixture.id}: no line says a check did not happen, so the Verified guard below is checking nothing`,
      ).toBeGreaterThan(0);

      const verified = rows.filter((r) => r.status === "verified");
      expect(verified.length, `${fixture.id}: the view has at least one Verified line to check`).toBeGreaterThan(0);
      for (const row of verified) {
        expect(row.detail, `${fixture.id}: "${row.label}" is Verified but names no comparison: "${row.detail}"`).toMatch(NAMES_A_COMPARISON);
        expect(row.detail, `${fixture.id}: "${row.label}" is Verified and denies its own check: "${row.detail}"`).not.toMatch(DENIES_A_CHECK);
      }

      // Secondary, and deliberately not a fixed number: the chips over the panel count the rows below them.
      const chips = await status.getByTestId("status-counts").textContent();
      for (const [key, word] of Object.entries(CHIP_WORD)) {
        const n = rows.filter((r) => r.status === key).length;
        if (n > 0) expect(chips, `${fixture.id}: the panel counts ${n} ${word.toLowerCase()}`).toContain(`${n} ${word.toLowerCase()}`);
      }
    });
  }

  test("the carrier number and the buyer's word stay Unverified, and keep saying why", async ({ page }) => {
    // The empty-box deal is the one that reaches shipping and delivery with both lines on it.
    const fixture = ALL_FIXTURES.find((f) => f.id === "empty-box")!;
    await openFinishedDeal(page, fixture.name);
    const rows = await statusRows(page);

    const tracking = rows.find((r) => /tracking number/i.test(r.label));
    expect(tracking, "the shipped deal has a tracking line").toBeTruthy();
    expect(tracking!.status, "Pay Pals never queries the carrier, so tracking is never Verified").toBe("unverified");
    expect(tracking!.detail).toContain(fixture.shipment!.trackingNumber);
    expect(tracking!.detail).toContain("Pay Pals does not query the carrier");

    const delivery = rows.find((r) => /delivery confirmed/i.test(r.label));
    expect(delivery, "the delivered deal has a delivery line").toBeTruthy();
    expect(delivery!.status, "nobody read a carrier scan, so delivery is never Verified").toBe("unverified");
    expect(delivery!.detail).toContain("Pay Pals did not read a carrier scan");
    expect(delivery!.detail).toContain("the buyer's word");
  });

  test("the arrival line says what was compared, and claims a serial's source only from the check", async ({ page }) => {
    const fixture = ALL_FIXTURES.find((f) => f.id === "clean-ps5")!;
    await openFinishedDeal(page, fixture.name);
    const rows = await statusRows(page);

    const arrival = rows.find((r) => /arrival check/i.test(r.label));
    expect(arrival, "the completed deal has an arrival line").toBeTruthy();
    expect(arrival!.detail).toMatch(/compared the arrival photos/i);
    expect(arrival!.detail).toContain("locked card version");

    /**
     * Contracts v1.8.0 added `observed.serialSource`, so "the pal read it off
     * the picture" became a claim the page is sometimes entitled to make.
     * This used to forbid that sentence outright, which was right while the
     * claim was always unfounded and is wrong now. The rule it is replaced
     * with is the one that still holds: the page may say where a number came
     * from only when the check records it, and must say the thing that source
     * means and not another. Read from the check rather than from the
     * sentence, so this cannot be satisfied by the wording it is checking.
     */
    const res = await page.request.get(`/api/deals/${/\/deals\/([^/?]+)/.exec(page.url())![1]}`);
    expect(res.ok(), `GET the deal -> ${res.status()}`).toBe(true);
    const { arrivalCheck } = (await res.json()) as {
      arrivalCheck: { observed: { serial: string | null; serialSource?: "photo" | "description" | null } } | null;
    };
    expect(arrivalCheck, "the completed deal has an arrival check behind the line").toBeTruthy();

    const { serial, serialSource } = arrivalCheck!.observed;
    console.log(`arrival line: serial=${serial ?? "none"} source=${serialSource ?? "absent"}\n  ${arrival!.detail}`);
    const SAYS_READ_OFF_A_PICTURE = /read off the picture/i;
    const SAYS_THE_BUYER_S_WORD = /comes from the description filed with the photo/i;
    const SAYS_IT_DOES_NOT_KNOW = /does not record where that number came from/i;

    if (!serial) {
      // No number, so nothing to attribute, and the line must attribute nothing.
      for (const claim of [SAYS_READ_OFF_A_PICTURE, SAYS_THE_BUYER_S_WORD, SAYS_IT_DOES_NOT_KNOW]) {
        expect(arrival!.detail, `no serial on the check, so the line claims nothing about one: "${arrival!.detail}"`).not.toMatch(claim);
      }
      return;
    }

    expect(arrival!.detail, "a serial the check holds is named on the line").toContain(serial);
    const expected =
      serialSource === "photo" ? SAYS_READ_OFF_A_PICTURE : serialSource === "description" ? SAYS_THE_BUYER_S_WORD : SAYS_IT_DOES_NOT_KNOW;
    const forbidden = [SAYS_READ_OFF_A_PICTURE, SAYS_THE_BUYER_S_WORD, SAYS_IT_DOES_NOT_KNOW].filter((p) => p !== expected);

    expect(arrival!.detail, `serialSource is ${serialSource ?? "absent"}, so the line must say so: "${arrival!.detail}"`).toMatch(expected);
    for (const claim of forbidden) {
      expect(arrival!.detail, `serialSource is ${serialSource ?? "absent"}, so the line must not say the other thing: "${arrival!.detail}"`).not.toMatch(claim);
    }
  });
});
