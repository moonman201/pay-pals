import type { ScenarioFixture } from "@pay-pals/contracts";
import Link from "next/link";
import { PalAvatar } from "../pal/PalAvatar";
import { buttonClass } from "../ui/Button";
import { ArrowIcon, IssueIcon, ShieldCheckIcon, ShieldStopIcon } from "../ui/icons";

type Outcome = { kind: "blocked" | "complete" | "issue"; line: string };

/** How each scenario ends. The visual on the card says it before the text does. */
const ENDINGS: Record<ScenarioFixture["id"], Outcome> = {
  "fake-slab": { kind: "blocked", line: "Ends blocked. No money moves." },
  "clean-ps5": { kind: "complete", line: "Ends complete. Paid, shipped, matched." },
  "empty-box": { kind: "issue", line: "Ends in an issue with an evidence pack." },
};

const OUTCOME_STYLE: Record<Outcome["kind"], { box: string; label: string }> = {
  blocked: { box: "bg-stop-soft text-stop ring-stop-line", label: "Blocked" },
  complete: { box: "bg-go-soft text-go ring-go-line", label: "Complete" },
  issue: { box: "bg-caution-soft text-caution ring-caution-line", label: "Issue open" },
};

function OutcomeMark({ kind }: { kind: Outcome["kind"] }) {
  const style = OUTCOME_STYLE[kind];
  const Icon = kind === "blocked" ? ShieldStopIcon : kind === "complete" ? ShieldCheckIcon : IssueIcon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${style.box}`} data-outcome={kind}>
      <Icon size={16} />
      {style.label}
    </span>
  );
}

/** One demo scenario. Posting the form creates a fresh copy of it and opens the deal room. */
export function ScenarioCard({ fixture, finishedDealId }: { fixture: ScenarioFixture; finishedDealId: string | null }) {
  const ending = ENDINGS[fixture.id];
  return (
    <article className="theme-buyer in-box flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex -space-x-2">
          <PalAvatar pal="buyer" size={36} />
          <PalAvatar pal="seller" size={36} />
        </div>
        <OutcomeMark kind={ending.kind} />
      </div>
      <h3 className="mt-3 text-xl font-bold text-navy">{fixture.name}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-ink">{fixture.summary}</p>
      <p className="mt-3 text-xs text-muted">{ending.line}</p>
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
        // The finished deal is the payoff, so it gets a pressable control, not a caption.
        <Link href={`/deals/${finishedDealId}?as=buyer`} className={`theme-buyer mt-2 w-full ${buttonClass("secondary")}`}>
          See the finished deal
          <ArrowIcon size={16} />
        </Link>
      ) : null}
    </article>
  );
}
