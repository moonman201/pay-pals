/**
 * The review route with the client gone. Driven through the real route
 * handler, the real flows and the in-memory store, with rules-only pals made
 * slow by the review-delay knob, so no model is called.
 *
 * What it proves: a client that drops the connection a moment after the
 * review starts does not stop it. The verdict is saved and the deal moves on
 * (REVIEWED, or BLOCKED for the slab). A second press while it runs joins the
 * run and the pal is asked once.
 */
import type { ScenarioId } from "@pay-pals/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startDemoDeal } from "@/lib/deal/flows/start";
import { isReviewing, resetReviewRegistry, runningReview } from "@/lib/deal/review-registry";
import { createServices } from "@/lib/services";

type Services = ReturnType<typeof createServices>;
let services: Services;
vi.mock("@/lib/services", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/services")>()), getServices: () => services }));

import { POST } from "./route";

const quiet = () => {};

async function setup(scenario: ScenarioId) {
  services = createServices({ PAY_PALS_DEMO_ONLY: "1", PAY_PALS_REVIEW_DELAY_MS: "300" }, quiet);
  await services.ready;
  const deal = await startDemoDeal(services, scenario);
  const calls = vi.spyOn(services.buyerPal, "review");
  return { deal, calls };
}

const post = (id: string, accept: string) =>
  POST(new Request(`http://localhost/api/deals/${id}/review`, { method: "POST", headers: { accept } }), { params: Promise.resolve({ id }) });

async function untilIdle(id: string) {
  const run = runningReview(id);
  if (run) await run.done.catch(() => {});
  expect(isReviewing(id)).toBe(false);
}

beforeEach(() => resetReviewRegistry());
afterEach(() => resetReviewRegistry());

describe("review route, client drops the connection", () => {
  it.each([
    ["clean-ps5", "REVIEWED"],
    ["fake-slab", "BLOCKED"],
  ] as const)("%s: the verdict is saved and the deal reaches %s", async (scenario, finalState) => {
    const { deal } = await setup(scenario);
    const res = await post(deal.id, "text/event-stream");
    const reader = res.body!.getReader();
    await reader.read(); // the first frame arrives
    await reader.cancel(); // the tab closes

    expect((await services.store.getDeal(deal.id))!.state).toBe("LISTED");
    expect(isReviewing(deal.id)).toBe(true);

    await untilIdle(deal.id);
    expect((await services.store.getDeal(deal.id))!.state).toBe(finalState);
    const verdicts = await services.store.listVerdicts(deal.id);
    expect(verdicts).toHaveLength(1);
  });

  it("a second press while one runs joins it: one review, one verdict", async () => {
    const { deal, calls } = await setup("clean-ps5");
    const first = await post(deal.id, "text/event-stream");
    const reader = first.body!.getReader();
    await reader.read();
    const second = await post(deal.id, "application/json");
    expect(second.status).toBe(200);
    expect(((await second.json()) as { dealId: string }).dealId).toBe(deal.id);
    await reader.cancel();
    await untilIdle(deal.id);
    // A count, not toHaveBeenCalledTimes: a failure there tries to print the whole services object.
    expect(calls.mock.calls.length).toBe(1);
    expect(await services.store.listVerdicts(deal.id)).toHaveLength(1);
  });

  it("a review that lost the race to another instance saves nothing", async () => {
    const { deal } = await setup("clean-ps5");
    const first = await post(deal.id, "text/event-stream");
    // Another instance finished the same card while this one was working.
    await services.store.transition(deal.id, "REVIEWED", "system", "Reviewed elsewhere.");
    await first.body!.cancel();
    await untilIdle(deal.id);
    expect(await services.store.listVerdicts(deal.id)).toHaveLength(0);
  });
});
