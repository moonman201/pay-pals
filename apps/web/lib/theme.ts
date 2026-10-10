/**
 * The colour mode, which is the page layer behind the boxes: day is a
 * white page, night is the navy page the site shipped with. The boxes are
 * navy in both. The device setting decides until the visitor picks a mode,
 * and then their pick is kept. See app/tokens.css for what each one paints.
 */

export type ThemeMode = "light" | "dark";

/** On the html element. No attribute means "follow the device". */
export const THEME_ATTRIBUTE = "data-theme";

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

export function deviceThemeMode(view: Pick<Window, "matchMedia"> | null | undefined): ThemeMode {
  return view?.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

/** What the page is showing now: the attribute when one is set, the device otherwise. */
export function currentThemeMode(root: Element | null | undefined, view: Pick<Window, "matchMedia"> | null | undefined): ThemeMode {
  const chosen = root?.getAttribute(THEME_ATTRIBUTE);
  return isThemeMode(chosen) ? chosen : deviceThemeMode(view);
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
