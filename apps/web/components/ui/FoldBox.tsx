import type { ReactNode } from "react";

/**
 * A closed section that holds other panels, such as the Chat section around the private pal pane and the
 * shared chat. It is a div, not a section element, so the panels inside it stay the only landmarks that
 * carry their own names. The title is an h2 in the summary; the count is a number with its unit for a
 * screen reader.
 */
export function FoldBox({ title, count, unit, id, defaultOpen = false, children }: { title: string; count?: string | number; unit?: string; id?: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-4 rounded-xl border border-line bg-surface shadow-sm" data-fold>
      <details className="group" open={defaultOpen ? true : undefined}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-1 [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className="inline-block text-[var(--accent-ink)] transition-transform group-open:rotate-90">
            &rsaquo;
          </span>
          <h2 className="text-sm font-bold text-muted">{title}</h2>
          {count !== undefined ? (
            <span className="text-xs font-semibold text-muted" data-testid="fold-count">
              {count}
              {unit ? <span className="sr-only"> {unit}</span> : null}
            </span>
          ) : null}
        </summary>
        <div className="space-y-4 border-t border-line p-4">{children}</div>
      </details>
    </div>
  );
}
