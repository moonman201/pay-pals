/**
 * Two layers, two modes: the boxes are navy in both and the page behind
 * them swaps. Night is the site for every visitor who has not chosen, and
 * a choice is the only thing that changes it (G16).
 *
 * These read the files rather than a browser, because what has to hold is
 * structural: night is in the server's HTML so it needs no JavaScript, and
 * no rule anywhere reads the device, so none can repaint a page against a
 * choice the visitor made.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { THEME_ATTRIBUTE, THEME_BOOT_SCRIPT, THEME_STORAGE_KEY } from "@/lib/theme";

const here = path.dirname(new URL(import.meta.url).pathname);
/** Comments go, so a sentence about a selector is never mistaken for the selector. */
const read = (file: string) => readFileSync(path.join(here, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const layout = read("layout.tsx");
const tokens = read("tokens.css");
const globals = read("globals.css");

const BOX_PALETTE = ":root,\n.in-box {";
const DAY_BY_CHOICE = ':root[data-theme="light"] .on-page {';
const PAGE_BY_CHOICE = ':root[data-theme="light"] {';

/** The body of one block, found by its selector and closed by brace counting. */
function block(css: string, selector: string): string {
  const start = css.indexOf(selector);
  expect(start, `no block for ${selector}`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = start + selector.length - 1; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(start + selector.length, i);
  }
  throw new Error(`unclosed block for ${selector}`);
}

const declarations = (body: string) => new Map([...body.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)].map((m) => [m[1] ?? "", (m[2] ?? "").trim()] as const));

/** Every .tsx under apps/web, so a new page region cannot be added without a side on it. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === ".next") return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx") ? [full] : [];
  });
}

describe("the shipped theme", () => {
  it("renders night on the document, so a visitor with no choice gets it without JavaScript", () => {
    expect(layout).toMatch(/<html lang="en" data-theme="dark" suppressHydrationWarning>/);
    expect(layout).toMatch(/<ThemeScript \/>/);
  });

  it("sets a stored choice before the first paint, under the key the toggle writes", () => {
    expect(THEME_BOOT_SCRIPT).toContain(THEME_STORAGE_KEY);
    expect(THEME_BOOT_SCRIPT).toContain(THEME_ATTRIBUTE);
    expect(THEME_BOOT_SCRIPT.startsWith("try{")).toBe(true);
  });

  it("boots from the stored choice and nothing else, so the device cannot decide", () => {
    expect(THEME_BOOT_SCRIPT).toContain("localStorage.getItem");
    expect(THEME_BOOT_SCRIPT).not.toContain("matchMedia");
    expect(THEME_BOOT_SCRIPT).not.toContain("prefers-color-scheme");
    // Its one write is guarded by the stored value being one of the two modes.
    expect(THEME_BOOT_SCRIPT).toMatch(/if\(m==="light"\|\|m==="dark"\)document\.documentElement\.setAttribute/);
  });

  it("keeps the boxes navy in both modes, from one block shared by :root and .in-box", () => {
    const box = declarations(block(tokens, BOX_PALETTE));
    expect(box.get("--surface")).toBe("#131f35");
    expect(box.get("--wash")).toBe("#1a2a45");
    expect(box.get("--ink")).toBe("#e9eef7");
    // One palette block and one colour re-anchor: no mode may hand .in-box a different set.
    expect(tokens.match(/\.in-box/g)).toHaveLength(2);
  });

  it("re-anchors the text colour on both region classes, because body resolved it once", () => {
    expect(tokens).toMatch(/\.on-page,\n\.in-box \{\n {2}color: var\(--ink\);\n\}/);
  });

  it("gets into day one way only, which is the visitor asking for it", () => {
    const day = declarations(block(tokens, DAY_BY_CHOICE));
    expect(day.get("--ink")).toBe("#10213a");
    expect(day.get("--surface")).toBe("#ffffff");
    // One day page block and one day on-page block. A second way in is a second thing to keep in step.
    expect(tokens.match(/:root\[data-theme="light"\]/g)).toHaveLength(2);
  });

  it("reads the device setting in neither stylesheet, so no rule can overrule a choice", () => {
    // A prefers-color-scheme block would be the one rule able to repaint a page
    // against an explicit choice, because a media query and an attribute selector
    // have to be ordered against each other by hand. So it does not exist, and
    // that is checked here rather than its ordering being checked.
    for (const css of [tokens, globals]) {
      expect(css).not.toContain("prefers-color-scheme");
      expect(css).not.toContain(':not([data-theme=');
    }
    expect(tokens).not.toContain("@media");
    expect([...globals.matchAll(/@media \(?([a-z-]+)/g)].map((m) => m[1])).toEqual(["prefers-reduced-motion", "min-width", "print"]);
  });

  it("needs no night block, night being :root itself, so a day choice has nothing to fight", () => {
    expect(tokens).not.toContain('[data-theme="dark"]');
    expect(globals).not.toContain('[data-theme="dark"]');
  });

  it("hangs the mode-dependent rules in globals on the day attribute alone", () => {
    for (const rule of [".hero-art", ".day-only", ".night-only"]) {
      expect(globals, rule).toContain(`:root[data-theme="light"] ${rule} {`);
    }
    // Night is the bare rule, so the toggle shows the right half before any script runs.
    expect(globals).toMatch(/\n\.night-only \{\n {2}display: inline-flex;\n\}/);
  });

  it("gives every token the page layer swaps a value in both modes", () => {
    const day = declarations(block(tokens, DAY_BY_CHOICE));
    const night = declarations(block(tokens, BOX_PALETTE));
    expect(day.size).toBeGreaterThan(20);
    for (const name of day.keys()) expect(night.get(name), `${name} has no night value`).toBeTruthy();
    for (const name of ["--surface", "--wash", "--ink", "--muted", "--line", "--buyer", "--buyer-ink", "--seller", "--go", "--caution", "--stop"]) {
      expect(day.get(name), `${name} is read on the page and must differ by mode`).not.toBe(night.get(name));
    }
  });

  it("keeps a side on every page region, so the accent agrees with the palette it reads", () => {
    const regions = sources(path.join(here, "..")).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => line.includes("on-page"))
        .map((line) => [path.basename(file), line] as const),
    );
    expect(regions.length).toBeGreaterThan(4);
    for (const [file, line] of regions) expect(line, file).toMatch(/theme-(buyer|seller|\$\{role\})/);
  });

  it("gives the seller's start page the same blue chrome as every other page", () => {
    // The gold belongs to StartDealForm, which carries its own theme-seller. A gold focus
    // ring on this white page would be 3.30:1 where the blue one is 4.78:1.
    const page = read("deals/new/page.tsx");
    expect(page).toMatch(/<main className="on-page theme-buyer /);
    expect(page).not.toContain("theme-seller");
  });

  it("carries the mode through hydration as well, for the error shell the boot script cannot reach", () => {
    // notFound() answers with a bare html document: no layout, so no data-theme, no
    // stylesheet, and the script that arrives in the payload is never run.
    expect(layout).toMatch(/<ThemeSync \/>/);
    const notFound = read("deals/[id]/not-found.tsx");
    expect(notFound).toMatch(/<ThemeToggle \/>/);
  });

  it("swaps the page background and the deal room shell on :root, and nothing else there", () => {
    const page = declarations(block(tokens, PAGE_BY_CHOICE));
    expect([...page.keys()]).toEqual(["--bg", "--bg-room"]);
    expect(page.get("--bg")).toBe("#ffffff");
    expect(declarations(block(tokens, ":root {")).get("--bg")).toBe("#0b1322");
  });
});
