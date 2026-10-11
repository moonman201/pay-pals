import type { PalReasoning } from "@pay-pals/contracts";
import { hasAnyReason } from "@/lib/deal/pal-reasons";
import { PalReasons } from "./PalReasons";

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
 */
export function PalWork({ reasoning, className = "" }: { reasoning: PalReasoning | null | undefined; className?: string }) {
  if (!hasAnyReason(reasoning, ["checked", "couldNotVerify"])) return null;
  return (
    <details className={`group mt-4 rounded-lg border border-line bg-wash ${className}`} data-testid="pal-work">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-bold text-[var(--accent-ink)] [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">
          &rsaquo;
        </span>
        Show the pal&apos;s work
      </summary>
      <div className="px-3 pb-3">
        <PalReasons reasoning={reasoning} pal="buyer" only={["checked", "couldNotVerify"]} />
      </div>
    </details>
  );
}
