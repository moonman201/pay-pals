import type { ScenarioFixture } from "@pay-pals/contracts";
import Link from "next/link";
import { PalAvatar } from "../pal/PalAvatar";
import { buttonClass } from "../ui/Button";
import { HappyPath } from "./HappyPath";
import type { PathStep } from "./happy-path";
import { ArrowIcon, IssueIcon, ShieldCheckIcon, ShieldStopIcon } from "../ui/icons";

/** `gist` is the one sentence on the card. The fixture's longer summary and `line` sit behind "What happens". */
type Outcome = { kind: "blocked" | "complete" | "issue"; line: string; gist: string };

/** How each scenario ends. The visual on the card says it before the text does. */
const ENDINGS: Record<ScenarioFixture["id"], Outcome> = {
  "fake-slab": { kind: "blocked", line: "Ends blocked. No money moves.", gist: "A graded card, a real cert, and a seller pushing Friends and Family." },
  "clean-ps5": { kind: "complete", line: "Ends complete. Paid, shipped, matched.", gist: "A PlayStation 5 where the pal asks for one close-up, then it goes through." },
  "empty-box": { kind: "issue", line: "Ends in an issue with an evidence pack.", gist: "A PlayStation 5 that arrives as an empty box, with proof kept." },
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

/**
 * One demo scenario. Posting the form creates a fresh copy of it and opens
 * the deal room.
 *
 * The finished-deal link carries the scenario, never a deal id. An href with
 * an id in it is only correct until the next re-seed, and a landing page in
 * a cache, a tab, a bookmark or a screenshot keeps the id it was printed
 * with forever. /deals/finished/<scenario> resolves the current one at
 * request time, so a page rendered last week still works.
 */
export function ScenarioCard({ fixture, hasFinishedDeal, path }: { fixture: ScenarioFixture; hasFinishedDeal: boolean; path?: PathStep[] }) {
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
      <p className="mt-2 text-sm leading-relaxed text-ink">{ending.gist}</p>
      {path && path.length > 0 ? <HappyPath steps={path} /> : null}
      {/* The full story and the ending line, one tap away. Nothing the card used to say is gone. */}
      <details className="group mt-1 flex-1" data-testid="scenario-more">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-semibold text-[var(--accent-ink)] [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="inline-block transition-transform group-open:rotate-90">
            &rsaquo;
          </span>
          What happens
        </summary>
        <p className="text-sm leading-relaxed text-ink">{fixture.summary}</p>
        <p className="mt-2 text-xs text-muted">{ending.line}</p>
      </details>
      <form method="post" action="/api/demo/start" className="mt-4 grid grid-cols-2 gap-2">
        <input type="hidden" name="scenario" value={fixture.id} />
        <button type="submit" name="as" value="buyer" className={`theme-buyer ${buttonClass("primary")}`}>
          Play as buyer
        </button>
        <button type="submit" name="as" value="seller" className={`theme-seller ${buttonClass("primary")}`}>
          Play as seller
        </button>
      </form>
      {hasFinishedDeal ? (
        // The finished deal is the payoff, so it gets a pressable control, not a caption.
        <Link href={`/deals/finished/${fixture.id}?as=buyer`} className={`theme-buyer mt-2 w-full ${buttonClass("secondary")}`}>
          See the finished deal
          <ArrowIcon size={16} />
        </Link>
      ) : null}
    </article>
  );
}
