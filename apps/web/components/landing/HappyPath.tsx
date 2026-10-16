import type { PathStep, PathTone } from "./happy-path";

const TONE: Record<PathTone, string> = {
  go: "rounded-full px-2 ring-1 bg-go-soft text-go ring-go-line",
  caution: "rounded-full px-2 ring-1 bg-caution-soft text-caution ring-caution-line",
  stop: "rounded-full px-2 ring-1 bg-stop-soft text-stop ring-stop-line",
  done: "text-[var(--accent-ink)]",
};

/** A row of small labelled steps, in order. Wraps at phone width; the order is also the list order for a screen reader. */
export function HappyPath({ steps }: { steps: PathStep[] }) {
  return (
    <ol className="mt-3 flex list-none flex-wrap items-center gap-x-1 gap-y-1.5 p-0" aria-label="How this deal went" data-happy-path>
      {steps.map((s, i) => (
        <li key={`${s.label}-${i}`} className="inline-flex items-center gap-1">
          {i > 0 ? (
            <span aria-hidden className="text-xs text-muted">
              &rarr;
            </span>
          ) : null}
          <span className={`py-0.5 text-xs font-bold ${TONE[s.tone]}`}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}
