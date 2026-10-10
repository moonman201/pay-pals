/**
 * Two layers, two modes: the boxes are navy in both, the page behind them
 * swaps, the device setting decides and the visitor's choice beats it.
 * These read the files rather than a browser, because what matters is that
 * nothing is forced on the document and that neither mode's block in the
 * stylesheet can be overruled by the other.
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
const DAY_MEDIA = "@media (prefers-color-scheme: light) {";
const DAY_BY_DEVICE = ':root:not([data-theme="dark"]) .on-page {';
const DAY_BY_CHOICE = ':root[data-theme="light"] .on-page {';
const PAGE_BY_DEVICE = ':root:not([data-theme="dark"]) {';
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

const declarations = (body: string) => new Map([...body.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)].map((m) => [m[1], m[2].trim()] as const));

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
  it("forces no mode on the document, so the device setting decides", () => {
    expect(layout).not.toMatch(/data-theme/);
    expect(layout).toMatch(/<html lang="en" suppressHydrationWarning>/);
    expect(layout).toMatch(/<ThemeScript \/>/);
  });

  it("sets a stored choice before the first paint, under the key the toggle writes", () => {
    expect(THEME_BOOT_SCRIPT).toContain(THEME_STORAGE_KEY);
    expect(THEME_BOOT_SCRIPT).toContain(THEME_ATTRIBUTE);
    expect(THEME_BOOT_SCRIPT.startsWith("try{")).toBe(true);
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

  it("swaps the page layer by the device setting, with night as the default", () => {
    expect(tokens).toContain(DAY_MEDIA);
    expect(tokens).not.toContain("prefers-color-scheme: dark");
    expect(globals).not.toContain("prefers-color-scheme: dark");
    const day = declarations(block(tokens, DAY_BY_DEVICE));
    expect(day.get("--ink")).toBe("#10213a");
    expect(day.get("--surface")).toBe("#ffffff");
  });

  it("lets a stored night choice stand on a device set to light", () => {
    const media = block(tokens, DAY_MEDIA);
    const selectors = [...media.matchAll(/^ {2}(:root[^{]*)\{/gm)].map((m) => m[1].trim());
    expect(selectors).toHaveLength(2);
    for (const selector of selectors) expect(selector).toContain(':not([data-theme="dark"])');
  });

  it("lets a stored day choice stand on a device set to dark, from outside the media query", () => {
    const mediaEnd = tokens.indexOf(DAY_MEDIA) + block(tokens, DAY_MEDIA).length;
    expect(tokens.indexOf(DAY_BY_CHOICE)).toBeGreaterThan(mediaEnd);
    expect(tokens.indexOf(PAGE_BY_CHOICE)).toBeGreaterThan(mediaEnd);
    // Night needs no block of its own, being :root itself, so a day choice has nothing to fight.
    expect(tokens).not.toContain('[data-theme="dark"] .on-page');
    expect(tokens).not.toContain('[data-theme="dark"] {');
  });

  it("gives the two ways into day the same tokens and the same values", () => {
    expect(declarations(block(tokens, DAY_BY_CHOICE))).toEqual(declarations(block(tokens, DAY_BY_DEVICE)));
    expect(declarations(block(tokens, PAGE_BY_CHOICE))).toEqual(declarations(block(tokens, PAGE_BY_DEVICE)));
  });

  it("gives every token the page layer swaps a value in both modes", () => {
    const day = declarations(block(tokens, DAY_BY_DEVICE));
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

  it("swaps the page background and the deal room shell on :root, and nothing else there", () => {
    const page = declarations(block(tokens, PAGE_BY_CHOICE));
    expect([...page.keys()]).toEqual(["--bg", "--bg-room"]);
    expect(page.get("--bg")).toBe("#ffffff");
    expect(declarations(block(tokens, ":root {")).get("--bg")).toBe("#0b1322");
  });
});
