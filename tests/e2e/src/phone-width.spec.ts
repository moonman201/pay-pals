/**
 * Phone width: the clean deal again in a 390 px viewport (the "phone"
 * project in playwright.config.ts). No page may force a horizontal scroll:
 * landing, deal room at several states, and the evidence pack.
 */
import { expect, test } from "@playwright/test";
import { cleanGarmin } from "@pay-pals/contracts";
import { WEB_PRESENT } from "./env";
import { driveToDelivered, runArrivalCheck } from "./flows";
import { expectNoHorizontalScroll, expectState, panel, pressAction, startDemo, waitForHydration } from "./helpers";

test.describe("phone width", () => {
  test.skip(!WEB_PRESENT, "apps/web is not on this branch yet, nothing to load");

  test("landing, deal room and evidence pack fit a 390 px viewport", async ({ page }, testInfo) => {
    expect(testInfo.project.use.viewport?.width, "run this spec through the phone project").toBe(390);

    await page.goto("/");
    await expectNoHorizontalScroll(page, "landing page");

    const dealId = await startDemo(page, cleanGarmin, "buyer");
    await expectState(page, "Listed");
    await expectNoHorizontalScroll(page, "deal room, Listed");

    await driveToDelivered(page, dealId, cleanGarmin, {
      afterBuyerAgreed: async () => {
        await expect(panel(page, "Next step").getByText("You agreed to version 1, waiting for the other side.")).toBeVisible();
        await expectNoHorizontalScroll(page, "deal room, buyer agreed and waiting");
      },
    });
    await expectNoHorizontalScroll(page, "deal room, Delivered");

    await runArrivalCheck(page, cleanGarmin);
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
});
