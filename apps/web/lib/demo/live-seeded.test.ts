import type { Deal, DealEvent, ScenarioId } from "@pay-pals/contracts";
import { cleanPs5, emptyBox, fakeSlab } from "@pay-pals/contracts";
import { describe, expect, it, vi } from "vitest";
import { resolveSeededDeals, type SeededLookup } from "./live-seeded";
import { SEED_VERSION } from "./seed-version";
import type { DealFinder } from "./seed-fixtures";

const seeded = { "fake-slab": "slab-1", "clean-ps5": "clean-1", "empty-box": "box-1" } as Record<ScenarioId, string>;

function deal(id: string, scenario: ScenarioId, createdAt = "2026-10-01T00:00:00.000Z"): Deal {
  const base = scenario === "clean-ps5" ? cleanPs5.deal : scenario === "empty-box" ? emptyBox.deal : fakeSlab.deal;
  return { ...base, id, scenario, createdAt };
}

function stamped(dealId: string, scenario: ScenarioId): DealEvent[] {
  return [
    {
      id: `${dealId}-e1`,
      dealId,
      kind: "deal_created",
      actor: "system",
      summary: "Deal started",
      data: { seedVersion: SEED_VERSION, scenario },
      at: "2026-10-01T00:00:00.000Z",
      prevHash: null,
      hash: "a".repeat(64),
    },
  ];
}

/** A store that has exactly the deals it was given. */
function lookup(present: Record<string, Deal>, events: Record<string, DealEvent[]> = {}): SeededLookup {
  return {
    getDeal: vi.fn(async (id: string) => present[id] ?? null),
    listEvents: vi.fn(async (id: string) => events[id] ?? []),
  };
}

describe("resolveSeededDeals", () => {
  it("keeps every id the store still has", async () => {
    const present = { "slab-1": deal("slab-1", "fake-slab"), "clean-1": deal("clean-1", "clean-ps5"), "box-1": deal("box-1", "empty-box") };
    expect(await resolveSeededDeals(seeded, lookup(present))).toEqual(seeded);
  });

  it("drops an id the store no longer has, so the landing never links to a 404", async () => {
    const present = { "clean-1": deal("clean-1", "clean-ps5") };
    expect(await resolveSeededDeals(seeded, lookup(present))).toEqual({ "clean-ps5": "clean-1" });
  });

  it("picks up the id a re-seed left behind, when the store can look one up", async () => {
    const fresh = deal("clean-2", "clean-ps5", "2026-10-10T00:00:00.000Z");
    const store = lookup({ "slab-1": deal("slab-1", "fake-slab"), "box-1": deal("box-1", "empty-box") }, { "clean-2": stamped("clean-2", "clean-ps5") });
    const finder: DealFinder = { findDeals: vi.fn(async ({ scenario }) => (scenario === "clean-ps5" ? [fresh] : [])) };
    expect(await resolveSeededDeals(seeded, store, finder)).toEqual({ "fake-slab": "slab-1", "clean-ps5": "clean-2", "empty-box": "box-1" });
    expect(finder.findDeals).toHaveBeenCalledTimes(1);
  });

  it("never picks up a finished deal that carries no seed stamp, which is somebody's own run", async () => {
    const theirs = deal("clean-mine", "clean-ps5");
    const store = lookup({}, {});
    const finder: DealFinder = { findDeals: vi.fn(async () => [theirs]) };
    expect(await resolveSeededDeals({ "clean-ps5": "clean-1" }, store, finder)).toEqual({});
  });

  it("asks the store once per scenario and runs the three in parallel", async () => {
    const store = lookup({ "slab-1": deal("slab-1", "fake-slab"), "clean-1": deal("clean-1", "clean-ps5"), "box-1": deal("box-1", "empty-box") });
    await resolveSeededDeals(seeded, store);
    expect(store.getDeal).toHaveBeenCalledTimes(3);
  });

  it("drops a scenario whose lookup threw, and never throws into the landing", async () => {
    const store: SeededLookup = { getDeal: vi.fn(async () => { throw new Error("the database is down"); }), listEvents: vi.fn(async () => []) };
    const log = vi.fn();
    expect(await resolveSeededDeals(seeded, store, null, log)).toEqual({});
    expect(log).toHaveBeenCalledWith(expect.stringContaining("the database is down"));
  });

  it("survives a finder that throws", async () => {
    const finder: DealFinder = { findDeals: vi.fn(async () => { throw new Error("query failed"); }) };
    const log = vi.fn();
    expect(await resolveSeededDeals({ "clean-ps5": "clean-1" }, lookup({}), finder, log)).toEqual({});
    expect(log).toHaveBeenCalledWith(expect.stringContaining("query failed"));
  });

  it("has nothing to resolve when nothing was seeded", async () => {
    const store = lookup({});
    expect(await resolveSeededDeals({}, store)).toEqual({});
    expect(store.getDeal).not.toHaveBeenCalled();
  });
});
