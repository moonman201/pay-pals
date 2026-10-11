/**
 * The colour mode, which is the page layer behind the boxes: day is a
 * white page, night is the navy page the site shipped with. The boxes are
 * navy in both.
 *
 * Night is the default for every visitor, whatever their device is set to
 * (G16), and the only thing that changes it is the visitor's own choice,
 * which is kept. The device setting is read nowhere: not here, not in the
 * boot script, and there is no prefers-color-scheme rule in the stylesheets
 * either. See app/tokens.css for what each mode paints.
 */

export type ThemeMode = "light" | "dark";

/** On the html element. The server renders "dark" and the boot script may replace it. */
export const THEME_ATTRIBUTE = "data-theme";

/** Night, for anyone who has not chosen. Rendered by layout.tsx, so it needs no JavaScript. */
export const DEFAULT_THEME_MODE: ThemeMode = "dark";

export const THEME_STORAGE_KEY = "pay-pals-theme";

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark";
}

export function otherThemeMode(mode: ThemeMode): ThemeMode {
  return mode === "dark" ? "light" : "dark";
}

/** The visitor's stored choice, or null when they have not made one. Storage throws in some private windows. */
export function storedThemeMode(storage: Pick<Storage, "getItem"> | null | undefined): ThemeMode | null {
  try {
    const value = storage?.getItem(THEME_STORAGE_KEY);
    return isThemeMode(value) ? value : null;
  } catch {
    return null;
  }
}

/** Keeps the choice for next time. A visitor with storage blocked still gets the mode for this visit. */
export function storeThemeMode(storage: Pick<Storage, "setItem"> | null | undefined, mode: ThemeMode): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    return;
  }
}

/**
 * What the page is showing now: the attribute, which layout.tsx always
 * renders. The fallback is night rather than the device, so the one page
 * without a root layout (Next's error shell) agrees with every other page
 * instead of taking the device's word for it.
 */
export function currentThemeMode(root: Element | null | undefined): ThemeMode {
  const chosen = root?.getAttribute(THEME_ATTRIBUTE);
  return isThemeMode(chosen) ? chosen : DEFAULT_THEME_MODE;
}

export function applyThemeMode(root: Element | null | undefined, mode: ThemeMode): void {
  root?.setAttribute(THEME_ATTRIBUTE, mode);
}

/**
 * Runs before the first paint, so a visitor who chose a mode never sees
 * the other one. Plain ES5, one statement, wrapped in a try because
 * reading storage throws in some private windows.
 */
export const THEME_BOOT_SCRIPT =
  `try{var m=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});` +
  `if(m==="light"||m==="dark")document.documentElement.setAttribute(${JSON.stringify(THEME_ATTRIBUTE)},m)}catch(e){}`;
