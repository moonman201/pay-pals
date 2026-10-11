"use client";

import { applyThemeMode, currentThemeMode, otherThemeMode, storeThemeMode } from "@/lib/theme";
import { MoonIcon, SunIcon } from "./icons";

/**
 * Switches the page between the white day page and the navy night page and
 * keeps the choice for next time. The button names the mode it switches
 * to, and CSS decides which half of it shows (see app/globals.css), so it
 * is right on the first paint and this handles only the press.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  function flip() {
    const next = otherThemeMode(currentThemeMode(document.documentElement));
    applyThemeMode(document.documentElement, next);
    storeThemeMode(window.localStorage, next);
  }

  return (
    <button
      type="button"
      onClick={flip}
      data-testid="theme-toggle"
      className={`no-print inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-[var(--accent-ink)] underline-offset-2 hover:bg-[var(--accent-soft)] ${className}`}
    >
      <span className="day-only items-center gap-1.5">
        <MoonIcon size={18} />
        <span className="sr-only sm:not-sr-only">Night mode</span>
      </span>
      <span className="night-only items-center gap-1.5">
        <SunIcon size={18} />
        <span className="sr-only sm:not-sr-only">Day mode</span>
      </span>
    </button>
  );
}
