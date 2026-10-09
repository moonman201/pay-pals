import { visibleEvidence } from "@/lib/deal/flag-evidence";

/**
 * The line a pal quotes to back a flag up: the seller's own words, or the
 * rule's reading of the card. It is quoted and set quietly, under its own
 * label, because it is source material rather than the pal's sentence.
 *
 * On a phone it sits behind a "Why" toggle so the flags themselves stay
 * scannable; from 640 px up it is simply shown. The toggle is a checkbox
 * and a label, so it needs no script and the text is always in the page.
 */
export function FlagEvidence({ evidence, always = false }: { evidence: string | null | undefined; always?: boolean }) {
  const text = visibleEvidence(evidence);
  if (!text) return null;
  const body = (
    <div className={`${always ? "" : "why-body "}mt-1.5 border-l border-line pl-3`} data-testid="flag-evidence">
      <p className="text-xs font-semibold text-muted">Evidence</p>
      <p className="mt-0.5 text-xs leading-relaxed text-muted">&ldquo;{text}&rdquo;</p>
    </div>
  );
  if (always) return body;
  return (
    <div className="why">
      <label className="why-toggle mt-1 inline-flex min-h-11 cursor-pointer items-center text-xs font-semibold text-[var(--accent-ink)] underline underline-offset-2">
        <input type="checkbox" className="sr-only" />
        Why
      </label>
      {body}
    </div>
  );
}
