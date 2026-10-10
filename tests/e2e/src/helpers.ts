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
  // A finished deal room may have no button at all; any interactive element React owns will do.
  // React stamps every element it renders, so any stamped element means the page is live. Some pages
  // (an evidence page with nothing to build) have no button at all. The first visit to a route on the
  // dev server compiles it, which can take most of a minute.
  await page.waitForFunction(
    () => Array.from(document.body.querySelectorAll("*")).some((el) => Object.keys(el).some((k) => k.startsWith("__reactProps"))),
    undefined,
    { timeout: PAL_TIMEOUT },
  );
}

/** From the landing page, start a fresh copy of a scenario as one side. Returns the new deal id. */
export async function startDemo(page: Page, fixture: ScenarioFixture, side: Side): Promise<string> {
  await page.goto("/");
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: fixture.name }) });
  await card.getByRole("button", { name: `Play as ${side}` }).click();
  // The first request to a cold dev server compiles the route and seeds the demo deals with the real pals.
  await expect(page).toHaveURL(new RegExp(`/deals/[^/?]+\\?as=${side}$`), { timeout: PAL_TIMEOUT });
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
  // Same first-request cost as startDemo when this spec is the first to reach the server.
  await expect(page).toHaveURL(/\/deals\/[^/?]+\?as=buyer$/, { timeout: PAL_TIMEOUT });
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

/**
 * A deal room panel, found by its exact title.
 *
 * This used to match by case-insensitive substring, which is Playwright's
 * default for a role name, so every new panel heading that contained an
 * existing one collided under strict mode: "Payment" caught "Payment
 * confirmed by PayPal", "Pay" caught both. Twice the product markup was
 * changed to get around that, which is the tail wagging the dog. Exact is
 * the default now. A call site that really wants a prefix says so itself,
 * with a regular expression, which `exact` leaves alone.
 */
export function panel(page: Page, title: string | RegExp): Locator {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
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

/** The page fits its viewport: nothing forces a horizontal scroll. On failure the message names the elements that overflow. */
export async function expectNoHorizontalScroll(page: Page, where: string): Promise<void> {
  const result = await page.evaluate(() => {
    const inner = window.innerWidth;
    const scroll = document.scrollingElement?.scrollWidth ?? 0;
    const offenders: string[] = [];
    if (scroll > inner) {
      // A box can sit inside the viewport while its content runs past it, so look at scrollWidth as well as the box.
      for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
        const r = el.getBoundingClientRect();
        const spills = el.scrollWidth > el.clientWidth + 1 && el.scrollWidth > inner;
        if ((r.right > inner + 1 && r.width > 0) || spills) {
          const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
          offenders.push(`<${el.tagName.toLowerCase()} class="${el.className.toString().slice(0, 70)}"> right=${Math.round(r.right)} scrollWidth=${el.scrollWidth} clientWidth=${el.clientWidth} "${text}"`);
        }
        if (offenders.length >= 8) break;
      }
    }
    return { scroll, inner, offenders };
  });
  expect(result.scroll, `${where}: scrollWidth ${result.scroll} > innerWidth ${result.inner}. Overflowing: ${result.offenders.join(" | ") || "(none found)"}`).toBeLessThanOrEqual(result.inner);
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
  events: { kind: string; at: string }[];
  verdict: { questionsForSeller: string[] } | null;
  shipment: { flags?: { code: string; severity: string }[] } | null;
  hasEvidence: boolean;
  inviteDeclined: boolean;
  payment: { historyHash?: string | null; createdAt?: string; capturedAt?: string | null } | null;
}

/** GET /api/deals/[id], the full snapshot, for the few checks that are awkward on the page. */
export async function snapshot(page: Page, dealId: string): Promise<Snapshot> {
  const res = await page.request.get(`/api/deals/${dealId}`);
  expect(res.ok(), `GET /api/deals/${dealId} -> ${res.status()}`).toBe(true);
  return (await res.json()) as Snapshot;
}
