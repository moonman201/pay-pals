import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

const BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent)]";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-[var(--accent)] text-[var(--accent-contrast)] hover:brightness-95",
  secondary: "border border-[var(--accent-line)] bg-surface text-[var(--accent-ink)] hover:bg-[var(--accent-soft)]",
  quiet: "text-[var(--accent-ink)] hover:bg-[var(--accent-soft)]",
  danger: "border border-stop-line bg-surface text-stop hover:bg-stop-soft",
};

export function buttonClass(variant: ButtonVariant = "primary", extra = ""): string {
  return `${BASE} ${VARIANTS[variant]} ${extra}`.trim();
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = "primary", className = "", type = "button", ...rest }: Props) {
  return <button type={type} className={buttonClass(variant, className)} {...rest} />;
}
