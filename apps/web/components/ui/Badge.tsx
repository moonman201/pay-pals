import type { ReactNode } from "react";

export type Tone = "accent" | "neutral" | "go" | "caution" | "stop";

/** The pill, for a verdict only: a flag's severity or an outcome the pal decided. */
const PILL_TONES: Record<Tone, string> = {
  accent: "bg-[var(--accent-soft)] text-[var(--accent-ink)] border-[var(--accent-line)]",
  neutral: "bg-wash text-muted border-line",
  go: "bg-chip-go text-chip-go-ink border-go-line",
  caution: "bg-chip-caution text-chip-caution-ink border-caution-line",
  stop: "bg-chip-stop text-chip-stop-ink border-stop-line",
};

/** Everything else that labels a state is plain coloured text, with its icon if it has one. */
const TEXT_TONES: Record<Tone, string> = {
  accent: "text-[var(--accent-ink)]",
  neutral: "text-muted",
  go: "text-go",
  caution: "text-caution",
  stop: "text-stop",
};

export function Badge({ tone = "neutral", pill = false, children, className = "", ...rest }: { tone?: Tone; pill?: boolean; children: ReactNode; className?: string; "data-testid"?: string }) {
  const shape = pill ? `rounded-full border px-2.5 py-0.5 ${PILL_TONES[tone]}` : TEXT_TONES[tone];
  return (
    <span className={`inline-flex items-center text-xs font-semibold ${shape} ${className}`} {...rest}>
      {children}
    </span>
  );
}
