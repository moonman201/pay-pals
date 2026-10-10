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
}) {
  const titleClass = `text-sm font-bold uppercase tracking-wide ${accent ? "text-[var(--accent-ink)]" : "text-muted"}`;
  const heading = labelAs === "heading";
  return (
    <section
      className={`rounded-xl border border-line bg-surface shadow-sm ${className}`}
      {...(heading ? {} : { role: "region", "aria-label": label ?? (typeof title === "string" ? title : undefined) })}
    >
      {title ? (
        <header
          className={`flex items-center justify-between gap-3 rounded-t-xl border-b px-4 py-3 ${
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
