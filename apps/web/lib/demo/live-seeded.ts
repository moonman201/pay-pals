/**
 * Which finished demo deals are there right now.
 *
 * getServices().seededDeals resolves once per server process and the result
 * is kept on globalThis, so after a re-seed deletes the old demo deals from
 * Neon a warm instance keeps serving ids that 404 (REVIEW, Oct 9). The
 * landing asks this before it links to one: an id the store still has is
 * kept, an id it does not is looked up again through the finder, and a
 * scenario with nothing behind it drops its button rather than offering a
 * judge a dead link.
 *
 * Every scenario is resolved in parallel, so the landing pays one round trip
 * and not three.
 */
import type { Deal, ScenarioId } from "@pay-pals/contracts";
import { FINISHED_STATES, oldestSeeded, type DealFinder, type EventReader } from "./seed-fixtures";

export type SeededIds = Partial<Record<ScenarioId, string>>;

export interface SeededLookup extends EventReader {
  getDeal(id: string): Promise<Deal | null>;
}

type Log = (line: string) => void;

/**
 * The finished demo deal for one scenario, as it stands right now.
 *
 * The id this process seeded is only a starting guess: it is checked, and
 * when it is gone (or was never there) the store is asked for the current
 * seed-stamped finished deal instead. The landing and /deals/finished/[id]
 * both call this, so there is one answer to "which deal is the example" and
 * not two that can disagree.
 */
export async function resolveFinishedDeal(scenario: ScenarioId, startingId: string | null, lookup: SeededLookup, finder: DealFinder | null, log?: Log): Promise<string | null> {
  if (startingId) {
    try {
      const deal = await lookup.getDeal(startingId);
      if (deal) return startingId;
    } catch (error) {
      log?.(`[pay-pals] demo: could not read the seeded ${scenario} deal (${error instanceof Error ? error.message : String(error)})`);
      return null;
    }
  }
  if (!finder) {
    log?.(`[pay-pals] demo: the seeded ${scenario} deal is gone and this store cannot look one up, so the landing will not link to it`);
    return null;
  }
  try {
    const found = await oldestSeeded(lookup, await finder.findDeals({ scenario, states: FINISHED_STATES }));
    if (found) {
      log?.(`[pay-pals] demo: the seeded ${scenario} deal was re-seeded, now ${found.deal.id}`);
      return found.deal.id;
    }
  } catch (error) {
    log?.(`[pay-pals] demo: could not look up the ${scenario} deal again (${error instanceof Error ? error.message : String(error)})`);
  }
  log?.(`[pay-pals] demo: no finished ${scenario} deal in the store, so the landing will not link to one`);
  return null;
}

/** The ids as they stand now. Any scenario whose deal is gone is left out. */
export async function resolveSeededDeals(seeded: SeededIds, lookup: SeededLookup, finder: DealFinder | null = null, log?: Log): Promise<SeededIds> {
  const entries = Object.entries(seeded) as [ScenarioId, string | undefined][];
  const resolved = await Promise.all(entries.map(([scenario, id]) => resolveFinishedDeal(scenario, id ?? null, lookup, finder, log)));
  const out: SeededIds = {};
  for (const [i, [scenario]] of entries.entries()) {
    const id = resolved[i];
    if (id) out[scenario] = id;
  }
  return out;
}
