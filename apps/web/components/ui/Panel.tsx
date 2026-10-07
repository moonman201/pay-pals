import type { ReactNode } from "react";

/** A white card with a title row. Every section of the deal room sits in one. */
export function Panel({
  title,
  aside,
  children,
  className = "",
  accent = false,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Tint the header with the viewer's side colour. */
  accent?: boolean;
}) {
  return (
    <section className={`rounded-xl border border-line bg-white shadow-sm ${className}`}>
      {title ? (
        <header
          className={`flex items-center justify-between gap-3 rounded-t-xl border-b px-4 py-3 ${
            accent ? "border-[var(--accent-line)] bg-[var(--accent-soft)]" : "border-line"
          }`}
        >
          <h2 className={`text-sm font-bold uppercase tracking-wide ${accent ? "text-[var(--accent-ink)]" : "text-muted"}`}>{title}</h2>
          {aside}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}
