/**
 * Small page helpers shared by the scenario specs. Selectors are roles and
 * visible text only, never class names, so a restyle does not break them.
 */
import { expect, type Locator, type Page } from "@playwright/test";
import type { ScenarioFixture } from "@pay-pals/contracts";

export type Side = "buyer" | "seller";

/**
 * Wait until React has hydrated the page's buttons. Server-rendered HTML is
 * visible before the client bundle attaches handlers (slow in dev mode, where
 * each route compiles on first visit), and a click before that is lost.
 * React stamps every node it owns with a "__reactProps" key once it has.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll("button")).some((b) => Object.keys(b).some((k) => k.startsWith("__reactProps"))),
  );
}

/** From the landing page, start a fresh copy of a scenario as one side. Returns the new deal id. */
export async function startDemo(page: Page, fixture: ScenarioFixture, side: Side): Promise<string> {
  await page.goto("/");
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: fixture.name }) });
  await card.getByRole("button", { name: `Play as ${side}` }).click();
  await expect(page).toHaveURL(new RegExp(`/deals/[^/?]+\\?as=${side}$`));
  const id = /\/deals\/([^/?]+)/.exec(page.url())?.[1];
  if (!id) throw new Error(`No deal id in ${page.url()}`);
  expect(id).not.toBe(fixture.deal.id);
  await waitForHydration(page);
  return id;
}

/** Open the deal room as the other side. Demo mode lets one browser play both. */
export async function openRoomAs(page: Page, dealId: string, side: Side): Promise<void> {
  await page.goto(`/deals/${dealId}?as=${side}`);
  await expect(page.getByRole("banner").getByText(`You are the ${side}`, { exact: false })).toBeVisible();
  await waitForHydration(page);
}

export interface BuyerFirstInput {
  sellerEmail: string;
  listingUrl: string;
  buyerName: string;
  buyerEmail: string;
}

/**
 * The main way in: the landing page's "Use Pay Pals Protection" panel. The
 * buyer gives the seller's PayPal email and the listing link, plus a name and
 * email, and lands in a room that waits for the seller. Returns the deal id.
 */
export async function startBuyerFirst(page: Page, input: BuyerFirstInput): Promise<string> {
  await page.goto("/");
  await waitForHydration(page);
  const form = page.getByRole("form", { name: "Use Pay Pals Protection" });
  await expect(form).toBeVisible();
  await form.getByLabel("Seller's PayPal email").fill(input.sellerEmail);
  await form.getByLabel("Listing link").fill(input.listingUrl);
  await form.getByLabel("Your name").fill(input.buyerName);
  await form.getByLabel("Your email").fill(input.buyerEmail);
  await form.getByRole("button", { name: "Use Pay Pals Protection" }).click();
  await expect(page).toHaveURL(/\/deals\/[^/?]+\?as=buyer$/);
  const id = /\/deals\/([^/?]+)/.exec(page.url())?.[1];
  if (!id) throw new Error(`No deal id in ${page.url()}`);
  await waitForHydration(page);
  return id;
}

/** The seller's invite link. */
export function joinPath(dealId: string): string {
  return `/deals/${dealId}/join?as=seller`;
}

/**
 * How long a step that calls a pal may take. Demo mode answers in
 * milliseconds; a real Buyer Pal review or arrival check (Claude plus a
 * price lookup) can take over a minute. Used only after review and
 * arrival check, so the same specs run against a real-mode server through
 * E2E_BASE_URL without rewriting.
 */
export const PAL_TIMEOUT = 90_000;

/** The state badge in the deal room header. */
export async function expectState(page: Page, label: string): Promise<void> {
  await expect(page.getByRole("banner").getByText(label, { exact: true })).toBeVisible();
}

/** The state badge after a move that waited on a pal. */
export async function expectStateAfterPal(page: Page, label: string): Promise<void> {
  await expect(page.getByRole("banner").getByText(label, { exact: true })).toBeVisible({ timeout: PAL_TIMEOUT });
}

/** A deal room panel, found by its title. */
export function panel(page: Page, title: string | RegExp): Locator {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: title }) });
}

/** Press a button in the "Next step" panel, where the transition-table moves live. */
export async function pressAction(page: Page, label: string): Promise<void> {
  await panel(page, "Next step").getByRole("button", { name: label }).click();
}

/** Click every "Add" button the demo photo picker offers inside a step until none is left. */
export async function addAllDemoPhotos(step: Locator): Promise<number> {
  const add = step.getByRole("button", { name: "Add", exact: true });
  await expect(add.first()).toBeVisible();
  let added = 0;
  while ((await add.count()) > 0) {
    await add.first().click();
    added += 1;
  }
  return added;
}

/** The page fits its viewport: nothing forces a horizontal scroll. */
export async function expectNoHorizontalScroll(page: Page, where: string): Promise<void> {
  const widths = await page.evaluate(() => ({
    scroll: document.scrollingElement?.scrollWidth ?? 0,
    inner: window.innerWidth,
  }));
  expect(widths.scroll, `${where}: scrollWidth ${widths.scroll} > innerWidth ${widths.inner}`).toBeLessThanOrEqual(widths.inner);
}

export interface Snapshot {
  deal: {
    state: string;
    startedBy: "buyer" | "seller";
    listingUrl: string | null;
    sellerJoinedAt: string | null;
    lockedCardVersion: number | null;
    currentCardVersion: number;
  };
  hasEvidence: boolean;
  inviteDeclined: boolean;
  payment: { historyHash?: string | null } | null;
}

/** GET /api/deals/[id], the full snapshot, for the few checks that are awkward on the page. */
export async function snapshot(page: Page, dealId: string): Promise<Snapshot> {
  const res = await page.request.get(`/api/deals/${dealId}`);
  expect(res.ok(), `GET /api/deals/${dealId} -> ${res.status()}`).toBe(true);
  return (await res.json()) as Snapshot;
}
