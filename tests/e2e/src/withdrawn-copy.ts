/**
 * The withdrawn claims a rendered page must not carry.
 *
 * Three guards covered this before and none of them read a page, which is
 * how the landing came to carry two phrases Matt had withdrawn while every
 * suite stayed green and the visual baselines, which had the words in the
 * picture, passed under a two percent pixel tolerance. A sentence should
 * never have been defended by a pixel count.
 *
 * The policy and the denial rule both live in `packages/contracts` now.
 * This file called its own copy of the denial rule for one afternoon,
 * after the slab room's "That doesn't prove the seller has it" failed the
 * guard; `withdrawnClaimsIn` does it now, so there is one window and one
 * negator list rather than two.
 *
 * Two things are still added on top, and both are temporary or local:
 *
 *   - whatever apps/web's own table still carries that the shared list
 *     does not. That lane has not migrated, and a page is the one surface
 *     every rule is about, so the extra patterns are applied here rather
 *     than lost. Where that table marks a rule as allowed when the line
 *     denies it, this honours that, because three honest sentences on the
 *     live rooms depend on it: "It is not a check that the item is
 *     genuine" and two like it. That is the table's own exemption for the
 *     table's own patterns, not a second copy of the shared denial rule,
 *     and it goes when that lane migrates. See REVIEW.md.
 *   - claims that belong to a page rather than to the code. See
 *     PAGE_CLAIMS.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WITHDRAWN_CLAIMS, withdrawnClaimsIn } from "@pay-pals/contracts";
import { REPO_ROOT } from "./env";

/** The one table that has not migrated to the shared list yet. */
export const COPY_RULES_FILE = resolve(REPO_ROOT, "apps", "web", "lib", "copy-rules.test.ts");

export interface PageClaim {
  /** Matt's batch item, or "page" for one that belongs only to a rendered page. */
  id: string;
  pattern: RegExp;
  why: string;
  /**
   * apps/web's table marks some of its rules as allowed when the line
   * denies them, and three sentences on the live rooms rely on it: "It is
   * not a check that the item is genuine" and two like it. This is that
   * table's own exemption, reproduced for that table's own patterns, not a
   * second copy of the shared denial rule. The shared claims go through
   * `withdrawnClaimsIn`. Both this and the parser go when apps/web migrates.
   */
  unlessDenied?: boolean;
}

/** apps/web's own NEGATED, kept identical so its rules behave here as they do there. */
const APPS_WEB_NEGATED = /\b(not|never|neither|cannot)\b/i;

/** `{ rule: "D8", pattern: /…/i, instead: "…", unless: NEGATED }`, one per line in that table. */
const RULE_LINE = /\{\s*rule:\s*"([^"]+)",\s*pattern:\s*\/((?:[^/\\]|\\.)+)\/([gimsuy]*)\s*,\s*instead:\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')(\s*,\s*unless:\s*NEGATED)?\s*\}/g;

/**
 * apps/web's table, parsed as text because tests/e2e cannot import across
 * that boundary. `instead` is single-quoted whenever its own text carries
 * double quotes, which six of the rules do, so both quote styles are
 * accepted: the first version read only double quotes and silently took
 * ten of fifteen rules, dropping the D8 rule that catches the exact
 * sentence this guard exists for, and the liveness tests caught it.
 */
export function parseRules(source: string): PageClaim[] {
  const out: PageClaim[] = [];
  for (const m of source.matchAll(RULE_LINE)) {
    out.push({
      id: m[1]!,
      pattern: new RegExp(m[2]!, m[3]!.includes("i") ? "i" : ""),
      why: `apps/web copy rule ${m[1]!}`,
      unlessDenied: m[4] !== undefined,
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
 * Compared by exact pattern source, so this is an upper bound: a shared
 * pattern that is a superset of one here still counts as pending. Over
 * reporting is the safe direction, since everything it returns is applied
 * on top of the shared list rather than instead of it. Empty means that
 * lane has migrated and this parser can go.
 */
export function pendingMigration(source: string): PageClaim[] {
  return parseRules(source).filter((rule) => !SHARED_PATTERNS.has(rule.pattern.source));
}

/**
 * Claims withdrawn from a page rather than from the code, so no table
 * carries them. The slab's price claim was removed from the fixture in
 * 659b461 because Channel3 has no graded comps, so the room the card links
 * to cannot stand the sentence up. Written as the claim, not the sentence.
 */
export const PAGE_CLAIMS: PageClaim[] = [
  { id: "page", pattern: /sells for (about|around|roughly)?\s*\$\d/i, why: "no page may put a market price on the graded slab: there is no comp source behind it (659b461)" },
  { id: "page", pattern: /worth (about|around|roughly)?\s*\$\d/i, why: "same claim in other words" },
];

/** The patterns this guard adds to the shared list. */
export function localClaims(): PageClaim[] {
  return [...pendingMigration(readFileSync(COPY_RULES_FILE, "utf8")), ...PAGE_CLAIMS];
}

export interface Breach {
  id: string;
  why: string;
  line: string;
}

/**
 * Every withdrawn claim a page's visible text carries, line by line so the
 * failure names the sentence. The shared list is asked through
 * `withdrawnClaimsIn`, which knows that a denial close before a match is
 * the sentence the rules want.
 */
export function breaches(text: string, local: PageClaim[] = localClaims()): Breach[] {
  const found: Breach[] = [];
  for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    for (const claim of withdrawnClaimsIn(line)) {
      found.push({ id: claim.id, why: `${claim.why}. Instead: ${claim.instead}`, line });
    }
    for (const claim of local) {
      if (!claim.pattern.test(line)) continue;
      if (claim.unlessDenied && APPS_WEB_NEGATED.test(line)) continue;
      found.push({ id: claim.id, why: claim.why, line });
    }
  }
  return found;
}
