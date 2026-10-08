import type { ReactNode } from "react";

export type Tone = "accent" | "neutral" | "go" | "caution" | "stop";

const TONES: Record<Tone, string> = {
  accent: "bg-[var(--accent-soft)] text-[var(--accent-ink)] border-[var(--accent-line)]",
  neutral: "bg-wash text-muted border-line",
  go: "bg-emerald-50 text-go border-emerald-200",
  caution: "bg-amber-50 text-caution border-amber-200",
  stop: "bg-red-50 text-stop border-red-200",
};

export function Badge({ tone = "neutral", children, className = "", ...rest }: { tone?: Tone; children: ReactNode; className?: string; "data-testid"?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]} ${className}`} {...rest}>
      {children}
    </span>
  );
}
