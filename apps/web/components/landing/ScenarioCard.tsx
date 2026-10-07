import type { ScenarioFixture } from "@pay-pals/contracts";
import Link from "next/link";
import { buttonClass } from "../ui/Button";

const ENDINGS: Record<ScenarioFixture["id"], string> = {
  "fake-slab": "Ends blocked. No money moves.",
  "clean-ps5": "Ends complete. Paid, shipped, matched.",
  "empty-box": "Ends in an issue with an evidence pack.",
};

/** One demo scenario. Posting the form creates a fresh copy of it and opens the deal room. */
export function ScenarioCard({ fixture, index, finishedDealId }: { fixture: ScenarioFixture; index: number; finishedDealId: string | null }) {
  return (
    <article className="flex flex-col rounded-2xl border border-line bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Scenario {index}</p>
      <h3 className="mt-1 text-xl font-bold text-navy">{fixture.name}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-ink">{fixture.summary}</p>
      <p className="mt-3 text-xs text-muted">{ENDINGS[fixture.id]}</p>
      <form method="post" action="/api/demo/start" className="mt-4 grid grid-cols-2 gap-2">
        <input type="hidden" name="scenario" value={fixture.id} />
        <button type="submit" name="as" value="buyer" className={`theme-buyer ${buttonClass("primary")}`}>
          Play as buyer
        </button>
        <button type="submit" name="as" value="seller" className={`theme-seller ${buttonClass("primary")}`}>
          Play as seller
        </button>
      </form>
      {finishedDealId ? (
        <Link href={`/deals/${finishedDealId}?as=buyer`} className="mt-3 text-center text-xs text-muted underline-offset-2 hover:underline">
          See the finished deal
        </Link>
      ) : null}
    </article>
  );
}
