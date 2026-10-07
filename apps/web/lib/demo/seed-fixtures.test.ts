/**
 * The idempotent seed, run against the memory store wrapped in a small
 * finder: a second run seeds nothing, and a race (a finished deal appearing
 * during the replay) settles on the oldest.
 */
import type { Deal, DealState, ScenarioId } from "@pay-pals/contracts";
import { createMemoryDealStore } from "@pay-pals/db";
import { describe, expect, it } from "vitest";
import { createServices } from "../services";
import { FINISHED_STATES, seedFixtureDealsIfMissing, type DealFinder } from "./seed-fixtures";

/** Tracks every deal the store creates so it can answer findDeals the way a database would. */
function withFinder(store: ReturnType<typeof createMemoryDealStore>) {
  const ids: string[] = [];
  const wrapped = {
    ...store,
    async createDeal(input: Parameters<typeof store.createDeal>[0]) {
      const deal = await store.createDeal(input);
      ids.push(deal.id);
      return deal;
    },
    async findDeals(query: { scenario: ScenarioId; states?: readonly DealState[] }): Promise<Deal[]> {
      const deals = await Promise.all(ids.map((id) => store.getDeal(id)));
      return deals.filter((d): d is Deal => d !== null && d.scenario === query.scenario && (!query.states || query.states.includes(d.state)));
    },
  };
  return wrapped as typeof store & DealFinder;
}

function servicesOn(store: ReturnType<typeof withFinder>) {
  const base = createServices({}, () => {});
  return { store, buyerPal: base.buyerPal, buildEvidencePack: base.buildEvidencePack };
}

describe("seedFixtureDealsIfMissing", () => {
  it("seeds once and reuses the same deals on the next start", async () => {
    const store = withFinder(createMemoryDealStore());
    const services = servicesOn(store);
    const lines: string[] = [];
    const first = await seedFixtureDealsIfMissing(services, store, (l) => lines.push(l));
    expect(Object.keys(first).sort()).toEqual(["clean-ps5", "empty-box", "scam-ps5"]);
    expect(lines.at(-1)).toMatch(/3 seeded now/);
    for (const [scenario, id] of Object.entries(first)) {
      const deal = await store.getDeal(id!);
      expect(deal?.scenario).toBe(scenario);
      expect(FINISHED_STATES).toContain(deal?.state);
    }

    const second = await seedFixtureDealsIfMissing(services, store, (l) => lines.push(l));
    expect(second).toEqual(first);
    expect(lines.at(-1)).toMatch(/0 seeded now/);
    expect((await store.findDeals({ scenario: "clean-ps5", states: FINISHED_STATES })).length).toBe(1);
  });

  it("settles on the oldest finished deal when another instance seeded during the replay", async () => {
    const store = withFinder(createMemoryDealStore());
    const services = servicesOn(store);
    // A rival instance finished first: an older BLOCKED scam deal appears while we replay.
    let rivalId: string | null = null;
    const racing: DealFinder = {
      async findDeals(query) {
        const mine = await store.findDeals(query);
        if (query.scenario === "scam-ps5" && mine.length > 0 && !rivalId) {
          const rival = await store.createDeal({ seller: mine[0]!.seller, buyer: mine[0]!.buyer, scenario: "scam-ps5" });
          await store.transition(rival.id, "LISTED", "system", "Listed.");
          await store.transition(rival.id, "REVIEWED", "system", "Reviewed.");
          await store.transition(rival.id, "BLOCKED", "system", "Blocked.");
          rivalId = rival.id;
          // Make the rival older than ours.
          const older = await store.getDeal(rival.id);
          const ours = mine[0]!;
          return [{ ...older!, createdAt: new Date(Date.parse(ours.createdAt) - 60_000).toISOString() }, ours];
        }
        return mine;
      },
    };
    const ids = await seedFixtureDealsIfMissing(services, racing, () => {});
    expect(ids["scam-ps5"]).toBe(rivalId);
    expect(ids["clean-ps5"]).toBeDefined();
  });
});
