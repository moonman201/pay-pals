/**
 * Rule 11 held as a class, not six times.
 *
 * The room pass added inline links in sentences to replace restated rows,
 * and an inline link has no tap target unless it is given one. qa measured
 * six of them under 44 px at 390. This reads the source so the seventh
 * cannot be written without someone deciding about its height, because a
 * phone-width run is slow and nobody runs it per edit.
 *
 * Source scanning, not rendering: there is no viewport here, and the thing
 * that went wrong was a class string, which is what this reads.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TAP_LINK, TAP_LINK_WRAPPING } from "./tap";

const COMPONENTS = path.join(path.dirname(new URL(import.meta.url).pathname), "..");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(full);
    return entry.name.endsWith(".tsx") && !entry.name.includes(".test.") ? [full] : [];
  });
}

/** The opening tag of every anchor and next/link in a file, whitespace flattened. */
function linkTags(source: string): string[] {
  return [...source.matchAll(/<(?:a|Link)\s[^>]*?>/gs)].map((m) => m[0].replace(/\s+/g, " "));
}

/**
 * A tag is tall enough when it carries a 44 px minimum, however it was
 * written: inline, through one of the shared tokens, or through a class
 * constant declared in the same file, which is how the header's nav links
 * do it.
 */
function hasTapTarget(tag: string, source: string): boolean {
  if (tag.includes("min-h-11") || tag.includes("TAP_LINK") || tag.includes("buttonClass")) return true;
  // className={SOME_CONSTANT}: resolve it, rather than reporting a link that is already fine.
  const named = /className=\{([A-Za-z_$][\w$]*)\}/.exec(tag)?.[1];
  if (!named) return false;
  const declared = new RegExp(`const ${named}\\s*=\\s*["\`]([^"\`]*)["\`]`).exec(source)?.[1];
  return declared !== undefined && declared.includes("min-h-11");
}

describe("every link a judge has to hit", () => {
  it("is at least 44 px tall, which for an inline link means being given a box", () => {
    const short: string[] = [];
    for (const file of tsxFiles(COMPONENTS)) {
      const source = readFileSync(file, "utf8");
      for (const tag of linkTags(source)) {
        // A link with no href is not a control a thumb can reach.
        if (!/href=/.test(tag)) continue;
        if (!hasTapTarget(tag, source)) short.push(`${path.relative(COMPONENTS, file)}: ${tag.slice(0, 90)}`);
      }
    }
    expect(short, `links under 44 px tall:\n${short.join("\n")}`).toEqual([]);
  });

  it("finds the links at all, so a passing run is not an empty one", () => {
    const tags = tsxFiles(COMPONENTS).flatMap((f) => linkTags(readFileSync(f, "utf8"))).filter((t) => /href=/.test(t));
    expect(tags.length).toBeGreaterThan(8);
  });

  it("grows the anchor's own box, because that is what a thumb hits and what qa measures", () => {
    // A ::after overlay would look right and measure wrong. getBoundingClientRect
    // reads the element, so the element is what has to be 44 px.
    for (const token of [TAP_LINK, TAP_LINK_WRAPPING]) {
      expect(token).toContain("min-h-11");
      expect(token).toContain("inline-flex");
      expect(token).not.toContain("after:");
    }
  });
});
