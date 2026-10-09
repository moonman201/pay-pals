/**
 * Dark navy ships for every visitor. These read the two files rather than a
 * browser, because what matters is that the attribute is on the document
 * and that nothing in the light path can win over it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const here = path.dirname(new URL(import.meta.url).pathname);
const layout = readFileSync(path.join(here, "layout.tsx"), "utf8");
const tokens = readFileSync(path.join(here, "tokens.css"), "utf8");

describe("the shipped theme", () => {
  it("puts data-theme=dark on the html element", () => {
    expect(layout).toMatch(/<html lang="en" data-theme="dark">/);
  });

  it("scopes the prefers-color-scheme block so a device in light mode cannot overrule the attribute", () => {
    const media = tokens.slice(tokens.indexOf("@media (prefers-color-scheme: dark)"));
    expect(media).toMatch(/:root:not\(\[data-theme="light"\]\)/);
    // The attribute block is last and more specific than :root, so it wins whatever the device says.
    expect(tokens.indexOf(':root[data-theme="dark"]')).toBeGreaterThan(tokens.indexOf("@media (prefers-color-scheme: dark)"));
    expect(tokens).not.toMatch(/@media \(prefers-color-scheme: light\)/);
  });

  it("keeps the light tokens in the file, unused, so a light theme stays one attribute away", () => {
    const root = tokens.slice(tokens.indexOf(":root {"), tokens.indexOf(".theme-buyer {"));
    expect(root).toContain("--bg: #ffffff");
    expect(root).toContain("--ink: #10213a");
  });

  it("gives both themes a dark value for every token the dark block overrides", () => {
    const names = (block: string) => new Set([...block.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]));
    const attribute = tokens.slice(tokens.indexOf(':root[data-theme="dark"]'));
    const media = tokens.slice(tokens.indexOf("@media (prefers-color-scheme: dark)"), tokens.indexOf(':root[data-theme="dark"]'));
    expect(names(attribute)).toEqual(names(media));
  });
});
