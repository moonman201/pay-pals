/**
 * Does "Play as buyer" run the live model, or replay a fixture?
 *
 * A judge clicking "Play as buyer" on a scenario card gets a fresh copy of
 * that scenario. Nothing on the page proves the review that follows was
 * written by Claude rather than read out of the repo, so this spec proves
 * it from outside: it starts two independent copies of the same scenario
 * through the same button, reviews both, and compares.
 *
 * Identical input, twice. A replay gives the same words both times. A model
 * does not. On top of that the spec reads the structured verdict for values
 * no fixture holds: a Channel3 price check stamped seconds ago, and, when
 * the model adds a flag of its own, a flag with raisedByRule false, which
 * only packages/agents/src/buyer/merge-flags.ts can produce.
 *
 * It also prints which services the host is running, read from the snapshot:
 * the PayPal gateway (payMode), the price provider and the cert provider.
 *
 * This spends two Claude calls and two Channel3 lookups on whatever host it
 * points at, and leaves two unfinished demo deals behind, so it is a real
 * spec, out of the default suite. Against production, read-only apart from
 * those two demo deals, which is what the button does anyway:
 *
 *   E2E_BASE_URL=https://pay-pals-m00n1.vercel.app \
 *     npx playwright test -c playwright.real.config.ts src/live-model.real.spec.ts
 *
 * Naming the file keeps the PayPal sandbox spec, which pays an order, out of
 * the run.
 */
import { expect, test } from "@playwright/test";
import { cleanPs5 } from "@pay-pals/contracts";
import { WEB_PRESENT } from "./env";
import { reviewAsBuyer } from "./flows";
import { startDemo, type Side } from "./helpers";
import type { Page } from "@playwright/test";

interface LiveVerdict {
  overall: string;
  palMessage: string;
  createdAt: string;
  questionsForSeller: string[];
  flags: { code: string; severity: string; raisedByRule: boolean }[];
  priceCheck: { provider: string; marketLow: number; marketHigh: number; sources: unknown[]; checkedAt: string } | null;
  certCheck: { record: { provider: string } } | null;
}

interface LiveSnapshot {
  deal: { state: string; scenario: string | null };
  payMode: string;
  example: boolean;
  verdict: LiveVerdict | null;
}

async function reviewFreshCopy(page: Page, side: Side): Promise<{ dealId: string; verdict: LiveVerdict; snapshot: LiveSnapshot }> {
  const dealId = await startDemo(page, cleanPs5, side);
  await reviewAsBuyer(page);
  const res = await page.request.get(`/api/deals/${dealId}`);
  expect(res.ok(), `GET /api/deals/${dealId} -> ${res.status()}`).toBe(true);
  const snapshot = (await res.json()) as LiveSnapshot;
  expect(snapshot.verdict, "the reviewed deal has no verdict").not.toBeNull();
  return { dealId, verdict: snapshot.verdict!, snapshot };
}

test.describe("the Play as flow runs a live model", () => {
  test.skip(!WEB_PRESENT, "apps/web is not on this branch yet, nothing to load");

  test("two fresh copies of one scenario get two different reviews", async ({ browser }) => {
    const startedAt = Date.now();

    // Separate browser contexts so neither run can see the other's cookies or cache.
    const first = await browser.newContext();
    const second = await browser.newContext();
    const a = await reviewFreshCopy(await first.newPage(), "buyer");
    const b = await reviewFreshCopy(await second.newPage(), "buyer");
    await first.close();
    await second.close();

    for (const [label, run] of [
      ["A", a],
      ["B", b],
    ] as const) {
      const v = run.verdict;
      console.log(
        `run ${label}: deal ${run.dealId}\n` +
          `  services: paypal=${run.snapshot.payMode} prices=${v.priceCheck?.provider ?? "none"} certs=${v.certCheck?.record.provider ?? "none"} example=${run.snapshot.example}\n` +
          `  overall=${v.overall} flags=[${v.flags.map((f) => `${f.code}:${f.severity}${f.raisedByRule ? "" : "(model)"}`).join(", ")}]\n` +
          `  questions=${JSON.stringify(v.questionsForSeller)}\n` +
          `  pal: ${v.palMessage}`,
      );
    }

    // Two copies of the same scenario, the same card, the same chat. Only a generated
    // answer differs. This is the whole proof; everything below is corroboration.
    expect(a.dealId).not.toBe(b.dealId);
    expect(b.verdict.palMessage, "the two reviews are word for word identical, which is what a replay looks like").not.toBe(a.verdict.palMessage);

    // Written now, not seeded: both verdicts are stamped after this test started.
    for (const run of [a, b]) {
      expect(new Date(run.verdict.createdAt).getTime()).toBeGreaterThanOrEqual(startedAt);
      expect(run.snapshot.example, "a deal started from the button must not be an example deal").toBe(false);
      expect(run.snapshot.deal.scenario).toBe(cleanPs5.id);
      // Long enough to be a written answer rather than a canned line.
      expect(run.verdict.palMessage.length).toBeGreaterThan(120);
    }

    // The price check is the other half of "live": a provider, and a lookup stamped during this run.
    for (const run of [a, b]) {
      const price = run.verdict.priceCheck;
      expect(price, "no price check on the verdict").not.toBeNull();
      console.log(`run price: provider=${price!.provider} range=${price!.marketLow}-${price!.marketHigh} sources=${price!.sources.length} checkedAt=${price!.checkedAt}`);
      if (price!.provider === "channel3") {
        expect(new Date(price!.checkedAt).getTime()).toBeGreaterThanOrEqual(startedAt);
        expect(price!.sources.length).toBeGreaterThan(1);
      }
    }
  });
});
