/**
 * The withdrawn claims a rendered page must not carry.
 *
 * Three guards covered this before and none of them read a page:
 * `apps/web/lib/copy-rules.test.ts` scans .ts and .tsx,
 * `packages/agents/src/house-words.test.ts` scans the pal prose, and
 * `scripts/check-public-copy.ts` scans tracked Markdown. Between them they
 * cover every source of a sentence and no page, which is how the landing
 * came to carry two phrases Matt had withdrawn while every suite stayed
 * green and the visual baselines, which had the words in the picture,
 * passed under a two percent pixel tolerance. A sentence should never have
 * been defended by a pixel count.
 *
 * The policy itself now lives in `packages/contracts`, as
 * `WITHDRAWN_CLAIMS`, because the three tables had already drifted: this
 * guard was built to parse two of them and take the union after a sample
 * sentence turned out to be forbidden in a Markdown file and allowed in a
 * React component. That is fixed at the root, so the shared list is simply
 * imported.
 *
 * Two things are still added to it, and both are temporary or local:
 *
 *   - whatever apps/web's own table still carries that the shared list does
 *     not. That lane has not migrated yet, and a page is the one surface
 *     every rule is about, so the extra patterns are applied here rather
 *     than lost. The set is reported by `pendingMigration`, and it should
 *     empty itself when that lane lands. Nothing here is a quieter version
 *     of a shared rule: the shared list is applied whole, first.
 *   - claims that belong to a page rather than to the code, which no table
 *     carries. See PAGE_CLAIMS.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WITHDRAWN_CLAIMS } from "@pay-pals/contracts";
import { REPO_ROOT } from "./env";

/** The one table that has not migrated to the shared list yet. */
export const COPY_RULES_FILE = resolve(REPO_ROOT, "apps", "web", "lib", "copy-rules.test.ts");

export interface PageClaim {
  /** Matt's batch item, or "page" for one that belongs only to a rendered page. */
  id: string;
  pattern: RegExp;
  /** Text that also matches this is denying the claim, which is what the rules ask for. */
  unless?: RegExp;
  why: string;
}

/** `{ rule: "D8", pattern: /…/i, instead: "…", unless: NEGATED }`, one per line in that table. */
const RULE_LINE = /\{\s*rule:\s*"([^"]+)",\s*pattern:\s*\/((?:[^/\\]|\\.)+)\/([gimsuy]*)\s*,\s*instead:\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')(\s*,\s*unless:\s*NEGATED)?\s*\}/g;

/** The negation guard apps/web uses: a line that denies the claim is the sentence the rules want. */
const NEGATED = /\b(not|never|neither|cannot)\b/i;

/**
 * apps/web's table, parsed as text because tests/e2e cannot import across
 * that boundary. `instead` is single-quoted whenever its own text carries
 * double quotes, which six of the rules do, so both quote styles are
 * accepted: the first version of this read only double quotes and silently
 * took ten of fifteen rules, dropping the D8 rule that catches the exact
 * sentence this guard exists for, and the liveness tests are what caught it.
 */
export function parseRules(source: string): PageClaim[] {
  const out: PageClaim[] = [];
  for (const m of source.matchAll(RULE_LINE)) {
    out.push({
      id: m[1]!,
      pattern: new RegExp(m[2]!, m[3]!.includes("i") ? "i" : ""),
      unless: m[4] ? NEGATED : undefined,
      why: `apps/web copy rule ${m[1]!}`,
    });
  }
  if (out.length === 0) {
    throw new Error(`No copy rules parsed from ${COPY_RULES_FILE}. Its RULES table has changed shape, so its half of the patterns is no longer reaching the pages.`);
  }
  return out;
}

const SHARED_PATTERNS = new Set(WITHDRAWN_CLAIMS.flatMap((c) => c.patterns.map((p) => p.source)));

/**
 * What apps/web's table still carries that the shared list does not.
 *
 * Compared by exact pattern source, so this is an upper bound: the shared
 * D9 pattern is apps/web's with "they are genuine" added, and still counts
 * as pending because the strings differ. Over-reporting is the safe
 * direction, since everything it returns is applied on top of the shared
 * list rather than instead of it. Empty means that lane has migrated and
 * this parser can go.
 */
export function pendingMigration(source: string): PageClaim[] {
  return parseRules(source).filter((rule) => !SHARED_PATTERNS.has(rule.pattern.source));
}

/**
 * Claims withdrawn from a page rather than from the code, so no table
 * carries them. The slab's price claim was removed from the fixture in
 * 659b461 because Channel3 has no graded comps, so the room the card links
 * to cannot stand the sentence up: the landing promised a comparison the
 * deal could not make. Written as the claim, not the sentence.
 */
export const PAGE_CLAIMS: PageClaim[] = [
  { id: "page", pattern: /sells for (about|around|roughly)?\s*\$\d/i, why: "no page may put a market price on the graded slab: there is no comp source behind it (659b461)" },
  { id: "page", pattern: /worth (about|around|roughly)?\s*\$\d/i, why: "same claim in other words" },
];

/** The shared policy as page claims, with its own wording carried into the failure message. */
export function sharedClaims(): PageClaim[] {
  return WITHDRAWN_CLAIMS.flatMap((claim) => claim.patterns.map((pattern) => ({ id: claim.id, pattern, why: `${claim.why}. Instead: ${claim.instead}` })));
}

export function pageClaims(): PageClaim[] {
  return [...sharedClaims(), ...pendingMigration(readFileSync(COPY_RULES_FILE, "utf8")), ...PAGE_CLAIMS];
}

/** Every breach in a page's visible text, with the line it is on. */
export function breaches(text: string, claims: PageClaim[]): { claim: PageClaim; line: string }[] {
  const found: { claim: PageClaim; line: string }[] = [];
  for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    for (const claim of claims) {
      if (!claim.pattern.test(line)) continue;
      if (claim.unless?.test(line)) continue;
      found.push({ claim, line });
    }
  }
  return found;
}
