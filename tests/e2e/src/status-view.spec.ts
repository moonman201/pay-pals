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
import { ALL_FIXTURES, type ScenarioFixture } from "@pay-pals/contracts";
import { WEB_PRESENT } from "./env";
import { panel, waitForHydration, waitForReviewIdle } from "./helpers";
import { finishedDeal } from "./layout-helpers";

interface StatusRow {
  group: string;
  label: string;
  status: string;
  chip: string;
  detail: string;
}

/**
 * Four labels since Matt's deal room pass: Flagged joined them, for a check
 * that ran and did not match, which used to be filed under Unverified.
 */
const CHIP_WORD: Record<string, string> = { verified: "Verified", flagged: "Flagged", unverified: "Unverified", missing: "Missing" };

/**
 * A Verified line has to name the comparison it passed. These are the words
 * the view uses to join the two sides of one. This is a proxy for "it names
 * both sides", which no regular expression can check, and it catches the
 * failure that matters: a line that claims a check passed while its own
 * sentence names nothing it was checked against.
 */
const NAMES_A_COMPARISON = /\bcompar\w*\b|\bcheck\w*\b|\bmatch\w*\b|\bagree\w*\b|\bagainst\b|\bthe same\b|\bidentical\b|\breproduce[sd]?\b/i;

/**
 * A checked line that says this about itself is contradicting its own label.
 *
 * This was a list of phrasings and the room pass broke it: "nothing has
 * been locked or checked against it" is a denial, and the old
 * `nothing (has been|was) checked` could not see it past the two words in
 * between, so the guard quietly matched nothing on the slab room and the
 * assertion below went vacuous. The liveness floor is what caught that.
 * It is a shape now, not a list: a negator within a short reach of a
 * checking verb.
 *
 * And it has to tell two negations apart, which cost a round. "It is not a
 * check of ownership" is the honest disclaimer every Verified line carries
 * and is not a denial of that line's own check; "nothing has been checked
 * against it" and "did not read a carrier scan" are. So the negators are
 * the ones that deny an action, not the ones that deny a meaning: "is not
 * a check of" does not match, by design.
 */
const DENIES_A_CHECK =
  /\b(nothing|no)\b[^.]{0,40}\b(checked|compared|read)\b|\b(has not been|have not been|was not|were not|could not be|cannot be|did not)\b[^.]{0,20}\b(check\w*|compar\w*|read)\b/i;

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

/**
 * The finished seeded deal the landing page offers for a scenario. The one
 * helper does the finding, so there is a single place that knows how a
 * landing card turns into a deal room; this spec used to have a third copy
 * of it, reading the id out of the href.
 */
async function openFinishedDeal(page: Page, fixture: ScenarioFixture): Promise<void> {
  await finishedDeal(page, fixture);
  await waitForHydration(page);
  // The review streams, and a half-filled one would give a different set of rows.
  await waitForReviewIdle(page);
}

test.describe("the deal status view", () => {
  test.skip(!WEB_PRESENT, "apps/web is not on this branch yet, nothing to load");

  for (const fixture of ALL_FIXTURES) {
    test(`${fixture.id}: a checked line names the comparison it made`, async ({ page }) => {
      await openFinishedDeal(page, fixture);

      const status = panel(page, "Deal status");
      await expect(status, `${fixture.id}: the deal room shows the status view`).toBeVisible();
      // The legend was reworded with the fourth label. What it has to keep saying is that
      // Verified is not a claim about the item, and that every label is defined on the page.
      const legend = status.getByTestId("status-legend");
      await expect(legend).toContainText("Verified never means genuine or that the seller owns it.");
      for (const word of Object.values(CHIP_WORD)) await expect(legend, `the legend defines ${word}`).toContainText(`${word}:`);

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

      // Flagged is a check that ran and came back different, so it owes the same account of
      // itself as Verified: both say a comparison happened, and only the answer differs.
      const checked = rows.filter((r) => r.status === "verified" || r.status === "flagged");
      expect(checked.length, `${fixture.id}: the view has at least one checked line`).toBeGreaterThan(0);
      for (const row of checked) {
        // Label and detail together, because that is the unit a reader sees and the two sides of
        // a comparison are often split across them: "Seller Pal packing checklist" names what was
        // compared against and "1 required step not done" names the answer. Reading the detail
        // alone failed that row for saying something the row does say.
        const says = `${row.label}. ${row.detail}`;
        expect(says, `${fixture.id}: "${row.label}" is ${row.chip} but names no comparison: "${row.detail}"`).toMatch(NAMES_A_COMPARISON);
        expect(row.detail, `${fixture.id}: "${row.label}" is ${row.chip} and denies its own check: "${row.detail}"`).not.toMatch(DENIES_A_CHECK);
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
    await openFinishedDeal(page, fixture);
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
    await openFinishedDeal(page, fixture);
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
