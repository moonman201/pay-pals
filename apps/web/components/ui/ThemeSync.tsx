"use client";

import { useEffect } from "react";
import { applyThemeMode, storedThemeMode } from "@/lib/theme";

/**
 * Applies the visitor's stored colour mode on mount, from the same reader
 * the boot script uses. On every normal route the script has already
 * written the attribute and this changes nothing.
 *
 * It exists for Next's error shell. A notFound() is answered with a bare
 * <html id="__next_error__"> document: no root layout, no stylesheet and no
 * boot script. The layout then arrives in the streamed payload, and the
 * script element with it, but React does not run a script inserted that
 * way, so nothing would ever write the attribute and the page would keep
 * the device's mode against the visitor's choice. A component does run.
 *
 * The limit, on that page only: the correction lands at hydration rather
 * than before the first paint, so a dead deal link can show the device's
 * mode for a moment before it settles. That is the error shell, not an
 * oversight: there is no earlier point to run at.
 */
export function ThemeSync() {
  useEffect(() => {
    const chosen = storedThemeMode(window.localStorage);
    if (chosen) applyThemeMode(document.documentElement, chosen);
  }, []);

  return null;
}
