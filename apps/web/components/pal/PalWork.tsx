import type { PalReasoning } from "@pay-pals/contracts";
import { hasAnyReason } from "@/lib/deal/pal-reasons";
import { PalReasons } from "./PalReasons";

/**
 * The asks the "I'd look again if" line had no room for. Rule 4 outranks rule 1: that line may be
 * short, it may not be the only place an ask lived and then lose it.
 */
function RestOfAsks({ asks }: { asks: readonly string[] }) {
  return (
    <section className="mt-3 rounded-lg border border-[var(--accent-line)] bg-[var(--accent-soft)] p-3" data-testid="rest-of-asks">
      <h4 className="text-sm font-bold text-[var(--accent-ink)]">What else would change my mind</h4>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
        {asks.map((ask) => (
          <li key={ask}>{ask}</li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The pal's working, behind one expander, collapsed by default.
 *
 * Two groups are in here: what it checked, and what it could not check.
 * "What I found" is gone from the page, because the flag cards and the
 * review's own three reasons are what those findings were; its lines are
 * reused as the lead's reasons on a deal with no flags, so nothing it held
 * is lost. "What would change my mind" is gone too, because it is now the
 * one "I'd look again if" line at the top of the review.
 *
 * Collapsed, not deleted (Matt's rule 4). Everything the honesty work put
 * on this page is still one click away, and a reader who wants only the
 * verdict is no longer made to read past it.
 *
 * `bare` is for the deal room's "Pal's work" section, which is already the expander: the groups are
 * shown without a second one inside it.
 */
export function PalWork({ reasoning, restOfAsks = [], className = "", bare = false }: { reasoning: PalReasoning | null | undefined; restOfAsks?: readonly string[]; className?: string; bare?: boolean }) {
  if (!hasAnyReason(reasoning, ["checked", "couldNotVerify"]) && restOfAsks.length === 0) return null;
  const inner = (
    <>
      <PalReasons reasoning={reasoning} pal="buyer" only={["checked", "couldNotVerify"]} />
      {restOfAsks.length > 0 ? <RestOfAsks asks={restOfAsks} /> : null}
    </>
  );
  if (bare) {
    return (
      <div className={`mt-4 ${className}`} data-testid="pal-work">
        {inner}
      </div>
    );
  }
  return (
    <details className={`group mt-4 rounded-lg border border-line bg-wash ${className}`} data-testid="pal-work">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-bold text-[var(--accent-ink)] [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">
          &rsaquo;
        </span>
        Show the pal&apos;s work
      </summary>
      <div className="px-3 pb-3">{inner}</div>
    </details>
  );
}
