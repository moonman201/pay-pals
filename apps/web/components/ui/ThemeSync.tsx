"use client";

import { useEffect } from "react";
import { applyThemeMode, DEFAULT_THEME_MODE, storedThemeMode } from "@/lib/theme";

/**
 * Applies the visitor's stored colour mode on mount, from the same reader
 * the boot script uses. On every normal route the script has already
 * written the attribute and this changes nothing.
 *
 * It exists for Next's error shell. A notFound() is answered with a bare
 * <html id="__next_error__"> document: no root layout, so none of
 * layout.tsx's data-theme="dark", no stylesheet and no boot script. The
 * layout then arrives in the streamed payload, and the script element with
 * it, but React does not run a script inserted that way, so nothing would
 * ever write the attribute. A component does run.
 *
 * It writes the default when nothing is stored, rather than leaving the
 * attribute off, so that page carries the same attribute as every other
 * page and the toggle's first press goes the way it reads.
 *
 * The limit, on that page only: it lands at hydration rather than before
 * the first paint, so a visitor who chose day can see night for a moment
 * before it settles. Night, not their device's mode, because night is what
 * the stylesheet paints with no attribute set. That is the error shell, not
 * an oversight: there is no earlier point to run at.
 */
export function ThemeSync() {
  useEffect(() => {
    applyThemeMode(document.documentElement, storedThemeMode(window.localStorage) ?? DEFAULT_THEME_MODE);
  }, []);

  return null;
}
