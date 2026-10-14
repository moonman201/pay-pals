import type { ItemCard, PriceCheck } from "@pay-pals/contracts";
import { priceSourceNote } from "@/lib/deal/price-copy";
import { retailRange, summariseSources, priceText } from "@/lib/deal/price-sources";

/**
 * The price check in one line: what is being asked, the range of new listings the lookup returned, and
 * where the numbers came from ("via Channel3", or "demo prices" on a demo). A part with nothing behind it
 * is left out, never filled in: a check with no new listing says no "new at retail".
 *
 * The listings themselves, prices only and never a shop name, are behind "Show the listings".
 */
export function PriceLine({ check, card, testId = "price-line" }: { check: PriceCheck; card: ItemCard; testId?: string }) {
  const retail = retailRange(check);
  const sources = summariseSources(check);
  return (
    <div className="text-sm leading-relaxed text-ink" data-testid={testId}>
      <p>
        Asking <span className="font-bold">{priceText(card.askingPrice)}</span>
        {retail ? (
          <>
            , new at retail <span className="font-bold">{retail.text}</span>
          </>
        ) : null}
        , {priceSourceNote(check)}.
      </p>
      {sources && sources.prices.length > 0 ? (
        <details className="group">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden">
            <span aria-hidden className="inline-block transition-transform group-open:rotate-90">
              &rsaquo;
            </span>
            Show the listings
          </summary>
          <p className="text-xs text-muted">{sources.line}</p>
          <ul className="mt-1 flex flex-wrap gap-1" aria-label="Listing prices">
            {sources.prices.map((price, i) => (
              <li key={`${price}-${i}`} className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-xs">
                ${price}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
