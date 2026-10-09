/**
 * Phone width: the clean deal again in a 390 px viewport (the "phone"
 * project in playwright.config.ts). No page may force a horizontal scroll:
 * landing, deal room at several states, and the evidence pack. And every
 * button and link in the main flow is at least 44 px tall (PLAN item 11).
 */
import { expect, test } from "@playwright/test";
import { ALL_FIXTURES, cleanPs5 } from "@pay-pals/contracts";
import { WEB_PRESENT } from "./env";
import { driveToDelivered, runArrivalCheck } from "./flows";
import { expectNoHorizontalScroll, expectState, openRoomAs, panel, pressAction, startDemo, waitForHydration } from "./helpers";
import { finishedDeal, shortTapTargets } from "./layout-helpers";

test.describe("phone width", () => {
  test.skip(!WEB_PRESENT, "apps/web is not on this branch yet, nothing to load");

  test("landing, deal room and evidence pack fit a 390 px viewport", async ({ page }, testInfo) => {
    expect(testInfo.project.use.viewport?.width, "run this spec through the phone project").toBe(390);

    await page.goto("/");
    const protection = page.getByRole("form", { name: "Use Pay Pals Protection" });
    await expect(protection).toBeVisible();
    await expect(protection.getByLabel("Seller's PayPal email")).toBeVisible();
    await expect(protection.getByRole("button", { name: "Use Pay Pals Protection" })).toBeVisible();
    await expectNoHorizontalScroll(page, "landing page with the protection panel");

    const dealId = await startDemo(page, cleanPs5, "buyer");
    await expectState(page, "Listed");
    await expectNoHorizontalScroll(page, "deal room, Listed");

    await driveToDelivered(page, dealId, cleanPs5, {
      afterBuyerAgreed: async () => {
        await expect(panel(page, "Next step").getByText("You agreed to version 1, waiting for the other side.")).toBeVisible();
        await expectNoHorizontalScroll(page, "deal room, buyer agreed and waiting");
      },
    });
    await expectNoHorizontalScroll(page, "deal room, Delivered");

    await runArrivalCheck(page, cleanPs5);
    await pressAction(page, "Complete the deal");
    await expectState(page, "Complete");
    await expectNoHorizontalScroll(page, "deal room, Complete");

    await page.goto(`/deals/${dealId}/evidence?as=buyer`);
    await waitForHydration(page);
    await page.getByRole("button", { name: "Build the evidence pack" }).click();
    await expect(page.getByText("Pay Pals evidence pack")).toBeVisible();
    await expect(panel(page, /^Locked item card, version \d+$/)).toBeVisible();
    await expectNoHorizontalScroll(page, "evidence pack");
  });

  test("every button and link in the main flow is at least 44 px tall", async ({ page }, testInfo) => {
    expect(testInfo.project.use.viewport?.width, "run this spec through the phone project").toBe(390);

    // Every page is measured before the one assertion, so a failure lists every short target at once.
    const short: string[] = [];
    await page.goto("/");
    await waitForHydration(page);
    short.push(...(await shortTapTargets(page, "landing page")));
    await page.goto("/deals/new");
    await waitForHydration(page);
    short.push(...(await shortTapTargets(page, "list an item page")));

    const dealId = await startDemo(page, cleanPs5, "buyer");
    await expectState(page, "Listed");
    short.push(...(await shortTapTargets(page, "buyer's room, Listed")));
    await openRoomAs(page, dealId, "seller");
    short.push(...(await shortTapTargets(page, "seller's room, Listed")));

    for (const fixture of ALL_FIXTURES) {
      const { href, dealId: finishedId } = await finishedDeal(page, fixture);
      await page.goto(href);
      await waitForHydration(page);
      short.push(...(await shortTapTargets(page, `${fixture.id} finished deal room`)));
      await page.goto(`/deals/${finishedId}/evidence?as=buyer`);
      await waitForHydration(page);
      short.push(...(await shortTapTargets(page, `${fixture.id} evidence page`)));
    }
    expect(short, `every button and link in the main flow is at least 44 px tall. Short:\n${short.join("\n")}`).toEqual([]);
  });
});
