/**
 * The finished demo deal for a scenario, by scenario rather than by id.
 *
 * The landing used to link straight to /deals/<uuid>. Re-checking that id
 * per render only helps when a render happens: any HTML already in a cache,
 * an open tab, a bookmark, a screenshot or a judge's window keeps whichever
 * id it was printed with, and one re-seed later that id is dead. Matt hit
 * exactly that on production.
 *
 * So the href carries no id at all. This resolves the current deal at
 * request time, which makes a stale link impossible rather than unlikely: a
 * page cached from last week still points here, and here is always right.
 *
 * A route handler and not a page, so the status and the headers are ours:
 * 303 because the answer is a different resource rather than a moved one,
 * and no-store because a cached redirect would put the id back in a cache
 * and undo the whole point.
 */
import { SCENARIO_IDS, type ScenarioId } from "@pay-pals/contracts";
import { resolveFinishedDeal } from "@/lib/demo/live-seeded";
import { asDealFinder } from "@/lib/demo/seed-fixtures";
import { getServices } from "@/lib/services";
import { parseRole } from "@/lib/role";

export const dynamic = "force-dynamic";

/** Never cached, anywhere, by anything. The target changes every time the demo deals are re-seeded. */
const NEVER_CACHED = {
  "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
  pragma: "no-cache",
};

function isScenario(value: string): value is ScenarioId {
  return (SCENARIO_IDS as readonly string[]).includes(value);
}

/**
 * A relative Location, which RFC 7231 allows. An absolute one would be built
 * from the request URL, and behind a proxy that can carry the wrong scheme
 * or host; a relative one cannot send a judge from https to http.
 */
function seeOther(path: string): Response {
  return new Response(null, { status: 303, headers: { ...NEVER_CACHED, location: path } });
}

export async function GET(req: Request, { params }: { params: Promise<{ scenario: string }> }) {
  const { scenario } = await params;
  const url = new URL(req.url);
  const role = parseRole(url.searchParams.get("as"));

  if (!isScenario(scenario)) {
    return seeOther("/deals/finished/unavailable");
  }

  const services = getServices();
  await services.ready;
  const seeded = await services.seededDeals;
  const id = await resolveFinishedDeal(scenario, seeded[scenario] ?? null, services.store, asDealFinder(services.store));

  if (!id) {
    // Not a 404. "The example deal is being re-seeded" and "this page does not exist" are
    // different things, and a judge who clicks this deserves the first one.
    return seeOther(`/deals/finished/unavailable?scenario=${scenario}`);
  }

  return seeOther(`/deals/${encodeURIComponent(id)}?as=${role}`);
}
