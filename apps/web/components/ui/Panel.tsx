import type { ReactNode } from "react";

/** A white card with a title row. Every section of the deal room sits in one. */
export function Panel({
  title,
  aside,
  children,
  className = "",
  accent = false,
  labelAs = "heading",
  label,
  id,
  fold,
  flat = false,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Tint the header with the viewer's side colour. */
  accent?: boolean;
  /**
   * How the title is announced. "heading" is the default and puts it in the
   * page's heading outline. "region" names the panel as a landmark instead,
   * for a panel whose title repeats a word another panel's title already
   * uses, where a second heading would read as a duplicate of it.
   */
  labelAs?: "heading" | "region";
  /** The accessible name when labelAs is "region". Needed only when the title is not plain text. */
  label?: string;
  /** An anchor, so another panel can say "it is up there" and link rather than repeat it. */
  id?: string;
  /**
   * Render the panel closed behind its title, with a count beside it. One tap on the title row opens it.
   * The title stays an h2 inside the summary, so the page outline and the panel's name are what they were.
   * The count is short on screen (a number) and says its unit to a screen reader.
   */
  fold?: { count?: string | number; unit?: string; defaultOpen?: boolean };
  /** No border or shadow, for a panel that sits inside another one. */
  flat?: boolean;
}) {
  const titleClass = `text-sm font-bold uppercase tracking-wide ${accent ? "text-[var(--accent-ink)]" : "text-muted"}`;
  const heading = labelAs === "heading";
  const chrome = flat ? "" : "rounded-xl border border-line bg-surface shadow-sm";
  if (fold && title) {
    return (
      <section id={id} className={`scroll-mt-4 ${chrome} ${className}`} data-fold>
        <details className="group" open={fold.defaultOpen ? true : undefined}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-1 [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="inline-block text-[var(--accent-ink)] transition-transform group-open:rotate-90">
              &rsaquo;
            </span>
            <h2 className={`${titleClass} !normal-case !tracking-normal !text-sm`}>{title}</h2>
            {fold.count !== undefined ? (
              <span className="rounded-full bg-[var(--accent-soft)] px-2 text-xs font-bold text-[var(--accent-ink)]" data-testid="fold-count">
                {fold.count}
                {fold.unit ? <span className="sr-only"> {fold.unit}</span> : null}
              </span>
            ) : null}
          </summary>
          <div className="border-t border-line p-4">
            {aside ? <div className="mb-3 flex flex-wrap gap-2">{aside}</div> : null}
            {children}
          </div>
        </details>
      </section>
    );
  }
  return (
    <section
      id={id}
      // A linked panel must not land under the sticky header, and must not jump for someone who asked for less motion.
      className={`scroll-mt-4 ${chrome} ${className}`}
      {...(heading ? {} : { role: "region", "aria-label": label ?? (typeof title === "string" ? title : undefined) })}
    >
      {title ? (
        <header
          className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-t-xl border-b px-4 py-3 ${
            accent ? "border-[var(--accent-line)] bg-[var(--accent-soft)]" : "border-line"
          }`}
        >
          {heading ? <h2 className={titleClass}>{title}</h2> : <p className={titleClass}>{title}</p>}
          {aside}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}
