import { createMemoryDealStore, createReplayClock } from "@pay-pals/db";
import type { Deal, DealState, ScenarioId } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { createServices } from "../services";
import { formatSeedLine, parseSeedArgs, runSeed, seedExitCode, type SeedLine } from "./seed-cli";
import type { DealFinder } from "./seed-fixtures";

function memoryWithFinder() {
  const replay = createReplayClock();
  const store = createMemoryDealStore({ clock: replay.clock });
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
  const base = createServices({}, () => {});
  return { replay, store: wrapped as typeof store & DealFinder, services: { buyerPal: base.buyerPal, buildEvidencePack: base.buildEvidencePack, demoPayee: null } };
}

describe("parseSeedArgs", () => {
  it("reads --base in both spellings and trims a trailing slash", () => {
    expect(parseSeedArgs(["--base", "https://x.vercel.app/"])).toEqual({ ok: true, args: { base: "https://x.vercel.app", only: [] } });
    expect(parseSeedArgs(["--base=https://x.vercel.app"])).toEqual({ ok: true, args: { base: "https://x.vercel.app", only: [] } });
  });
  it("refuses a base that is not a URL, an unknown scenario and an unknown flag", () => {
    expect(parseSeedArgs(["--base", "nope"]).ok).toBe(false);
    expect(parseSeedArgs(["--only", "other"]).ok).toBe(false);
    expect(parseSeedArgs(["--yes"]).ok).toBe(false);
  });
  it("takes --only more than once", () => {
    expect(parseSeedArgs(["--only", "empty-box", "--only=fake-slab"])).toEqual({ ok: true, args: { base: null, only: ["empty-box", "fake-slab"] } });
  });
});

describe("runSeed", () => {
  it("seeds all three, then skips all three on the second run, and reports each id and time", async () => {
    const { replay, store, services } = memoryWithFinder();
    const first = await runSeed({ ...services, store, clock: replay.clock }, store, [], () => {}, replay);
    expect(first.map((l) => l.outcome)).toEqual(["seeded", "seeded", "seeded"]);
    expect(seedExitCode(first)).toBe(0);
    const second = await runSeed({ ...services, store, clock: replay.clock }, store, [], () => {}, replay);
    expect(second.map((l) => l.outcome)).toEqual(["existing", "existing", "existing"]);
    expect(second.map((l) => l.dealId)).toEqual(first.map((l) => l.dealId));
    expect(formatSeedLine(second[0]!)).toMatch(/already there, skipped .+ \(\d+\.\d s\)/);
  });

  it("runs only the scenarios asked for", async () => {
    const { replay, store, services } = memoryWithFinder();
    const lines = await runSeed({ ...services, store, clock: replay.clock }, store, ["empty-box"], () => {}, replay);
    expect(lines.map((l) => l.scenario)).toEqual(["empty-box"]);
  });

  it("records a failure, goes on to the next scenario and exits non-zero", async () => {
    const { replay, store, services } = memoryWithFinder();
    const failing: DealFinder = {
      findDeals: async (q) => {
        if (q.scenario === "clean-ps5") throw new Error("database went away");
        return store.findDeals(q);
      },
    };
    const lines = await runSeed({ ...services, store, clock: replay.clock }, failing, [], () => {}, replay);
    expect(lines.map((l) => l.outcome).sort()).toEqual(["failed", "seeded", "seeded"]);
    expect(seedExitCode(lines)).toBe(1);
    expect(formatSeedLine(lines.find((l) => l.outcome === "failed")!)).toMatch(/FAILED.*database went away/);
  });
});

describe("seedExitCode", () => {
  it("is non-zero for a stale seed or an empty run", () => {
    const stale: SeedLine = { scenario: "fake-slab", outcome: "stale", dealId: "x", ms: 1 };
    expect(seedExitCode([stale])).toBe(1);
    expect(seedExitCode([])).toBe(1);
  });
});
