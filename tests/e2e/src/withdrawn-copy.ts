/**
 * The withdrawn claims, read from the table apps/web already keeps.
 *
 * Three guards covered this before and none of them read the rendered page:
 * `apps/web/lib/copy-rules.test.ts` scans .ts and .tsx,
 * `packages/agents/src/house-words.test.ts` scans the pal prose, and
 * `scripts/check-public-copy.mjs` scans tracked Markdown. Between them they
 * cover every source of a sentence and no page, which is how the landing
 * came to carry two phrases Matt had withdrawn while every suite stayed
 * green and the visual baselines, which had the words in the picture,
 * passed under a two percent pixel tolerance. A sentence should never have
 * been defended by a pixel count.
 *
 * This adds the page, and it deliberately does not add a fourth list. The
 * rules are parsed out of apps/web's own table at run time, so a rule added
 * there is applied to the rendered page without anyone remembering to copy
 * it. tests/e2e cannot import across that boundary, so the file is read as
 * text; `parseRules` asserts it still found a table, and the spec asserts
 * the ids it expects are in it, so a refactor over there fails here with a
 * sentence rather than quietly checking nothing.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_ROOT } from "./env";

export const COPY_RULES_FILE = resolve(REPO_ROOT, "apps", "web", "lib", "copy-rules.test.ts");
export const MARKDOWN_RULES_FILE = resolve(REPO_ROOT, "scripts", "check-public-copy.mjs");

export interface WithdrawnClaim {
  /** Matt's batch item, D8 to D11, or "page" for one that belongs only to a rendered page. */
  id: string;
  pattern: RegExp;
  /** Text that also matches this is denying the claim, which is what the rules ask for. */
  unless?: RegExp;
  why: string;
}

/**
 * `{ rule: "D8", pattern: /…/i, instead: "…", unless: NEGATED }`, one per
 * line in that table. `instead` is single-quoted whenever its own text
 * carries double quotes, which six of the sixteen rules do, so both quote
 * styles are accepted. The first version of this read only double quotes
 * and silently parsed ten of sixteen, including dropping the D8 rule that
 * catches the exact sentence this spec exists for; the liveness tests below
 * are what caught it.
 */
const RULE_LINE = /\{\s*rule:\s*"([^"]+)",\s*pattern:\s*\/((?:[^/\\]|\\.)+)\/([gimsuy]*)\s*,\s*instead:\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')(\s*,\s*unless:\s*NEGATED)?\s*\}/g;

/** The negation guard apps/web uses: a line that denies the claim is the sentence the rules want. */
const NEGATED = /\b(not|never|neither|cannot)\b/i;

/** `{ id: "D8", why: "…", patterns: [/…/i, /…/i] }`, the Markdown guard's shape. */
const MARKDOWN_RULE = /\{\s*id:\s*"([^"]+)",\s*why:\s*"((?:[^"\\]|\\.)*)",\s*patterns:\s*\[([^\]]*)\]\s*\}/g;
const MARKDOWN_PATTERN = /\/((?:[^/\\]|\\.)+)\/([gimsuy]*)/g;

/**
 * The Markdown guard's rules, which are not the same set: it catches forms
 * apps/web's table misses, "proves the seller owns" being one I tripped
 * over writing this. A rendered page is the one surface every rule is
 * about, whoever wrote it down, so the page is checked against the union of
 * the two tables rather than either alone.
 */
export function parseMarkdownRules(source: string): WithdrawnClaim[] {
  const out: WithdrawnClaim[] = [];
  for (const rule of source.matchAll(MARKDOWN_RULE)) {
    for (const p of rule[3]!.matchAll(MARKDOWN_PATTERN)) {
      out.push({ id: rule[1]!, pattern: new RegExp(p[1]!, p[2]!.includes("i") ? "i" : ""), why: rule[2]! });
    }
  }
  if (out.length === 0) {
    throw new Error(`No copy rules parsed from ${MARKDOWN_RULES_FILE}. Its RULES table has changed shape, so half the rules are no longer reaching the pages.`);
  }
  return out;
}

export function parseRules(source: string): WithdrawnClaim[] {
  const out: WithdrawnClaim[] = [];
  for (const m of source.matchAll(RULE_LINE)) {
    out.push({
      id: m[1]!,
      pattern: new RegExp(m[2]!, m[3]!.includes("i") ? "i" : ""),
      unless: m[4] ? NEGATED : undefined,
      why: `apps/web copy rule ${m[1]!}`,
    });
  }
  if (out.length === 0) {
    throw new Error(`No copy rules parsed from ${COPY_RULES_FILE}. Its RULES table has changed shape, so the rendered pages are being checked against nothing.`);
  }
  return out;
}

/**
 * Claims withdrawn from a page rather than from the code, so apps/web's
 * table does not carry them. The slab's price claim was removed from the
 * fixture in 659b461 because Channel3 has no graded comps, so the room the
 * card links to cannot stand the sentence up: the landing promised a
 * comparison the deal could not make. Written as the claim, not the
 * sentence, so rewording does not escape it.
 */
export const PAGE_CLAIMS: WithdrawnClaim[] = [
  { id: "page", pattern: /sells for (about|around|roughly)?\s*\$\d/i, why: "no page may put a market price on the graded slab: there is no comp source behind it (659b461)" },
  { id: "page", pattern: /worth (about|around|roughly)?\s*\$\d/i, why: "same claim in other words" },
];

export function withdrawnClaims(): WithdrawnClaim[] {
  return [
    ...parseRules(readFileSync(COPY_RULES_FILE, "utf8")),
    ...parseMarkdownRules(readFileSync(MARKDOWN_RULES_FILE, "utf8")),
    ...PAGE_CLAIMS,
  ];
}

/** Every breach in a page's visible text, with the line it is on. */
export function breaches(text: string, claims: WithdrawnClaim[]): { claim: WithdrawnClaim; line: string }[] {
  const found: { claim: WithdrawnClaim; line: string }[] = [];
  for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    for (const claim of claims) {
      if (!claim.pattern.test(line)) continue;
      if (claim.unless?.test(line)) continue;
      found.push({ claim, line });
    }
  }
  return found;
}
