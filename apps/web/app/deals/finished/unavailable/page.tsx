/**
 * Where /deals/finished/<scenario> sends a judge when there is no finished
 * demo deal for that scenario right now.
 *
 * Deliberately not a 404. The example deals are deleted and written again
 * when they are re-seeded, so for a few seconds there is nothing to link to,
 * and "this is being rebuilt, here is what you can do instead" is a true and
 * useful thing to say where "this page does not exist" is neither.
 */
import { ALL_FIXTURES, SCENARIO_IDS, type ScenarioId } from "@pay-pals/contracts";
import Link from "next/link";
import { PalAvatar } from "@/components/pal/PalAvatar";
import { buttonClass } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

function fixtureFor(value: string | undefined): (typeof ALL_FIXTURES)[number] | null {
  if (!value || !(SCENARIO_IDS as readonly string[]).includes(value)) return null;
  return ALL_FIXTURES.find((f) => f.id === (value as ScenarioId)) ?? null;
}

export default async function FinishedDealUnavailablePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).scenario;
  const fixture = fixtureFor(Array.isArray(raw) ? raw[0] : raw);
  const named = fixture ? `the finished "${fixture.name}" deal` : "that finished example deal";

  return (
    <main className="theme-buyer mx-auto max-w-2xl px-4 py-12">
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-card" data-testid="finished-deal-unavailable">
        <div className="flex items-start gap-3">
          <PalAvatar pal="buyer" size={40} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-navy">That example deal is not here right now</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink">
              Pay Pals could not find {named}. The finished examples are deleted and written again whenever they are re-seeded, so this is what you see for the minute or
              two that takes. Nothing is broken and nothing of yours is affected.
            </p>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-ink">
          You can play {fixture ? `the "${fixture.name}" scenario` : "any scenario"} yourself right now, which is the same deal from the beginning rather than the finished
          copy. Pick a side from the landing page.
        </p>

        {fixture ? (
          <form method="post" action="/api/demo/start" className="mt-4 grid grid-cols-2 gap-2">
            <input type="hidden" name="scenario" value={fixture.id} />
            <button type="submit" name="as" value="buyer" className={`theme-buyer ${buttonClass("primary")}`}>
              Play as buyer
            </button>
            <button type="submit" name="as" value="seller" className={`theme-seller ${buttonClass("primary")}`}>
              Play as seller
            </button>
          </form>
        ) : null}

        <Link href="/" className={`mt-3 w-full ${buttonClass("secondary")}`}>
          Back to the demo scenarios
        </Link>
      </section>
    </main>
  );
}
