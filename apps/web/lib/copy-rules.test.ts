/**
 * The wording rules over apps/web, as a test, so a phrase we took out
 * cannot come back in.
 *
 * Two layers, and the split matters.
 *
 * The policy itself (D8 to D11) is WITHDRAWN_CLAIMS in @pay-pals/contracts,
 * read through withdrawnClaimsIn. It used to be a third copy of that table
 * here, and three copies of one policy had already drifted: qa found a claim
 * forbidden in a Markdown file and allowed in a React component. Adding a
 * claim there now tightens this guard too, which is the point of the move.
 *
 * On top of it, the patterns only this guard can see: things that are not a
 * withdrawn claim in themselves but are how apps/web would get there, like
 * "authenticated" or "protection applies". Those keep their own exemption,
 * for the reason below.
 *
 * Plus Matt's rule for every user-facing string: no em dashes.
 */
import { withdrawnClaimsIn } from "@pay-pals/contracts";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const SCAN = ["app", "components", "lib"];

interface Rule {
  rule: string;
  pattern: RegExp;
  instead: string;
  /** A line that also matches this is a line saying the thing is NOT so, which is what the rules ask for. */
  unless?: RegExp;
}

/**
 * The exemption for this guard's own patterns, and not the same thing as
 * the shared NEGATOR in withdrawn-claims.ts.
 *
 * The shared one looks for a denial immediately before the claim, because
 * it guards sentences like "That doesn't prove the seller has it": a denial
 * of the **action** the claim makes, in a short window, so a denial three
 * sentences earlier cannot launder a later bare claim.
 *
 * This one guards a different shape. "A matching serial supports the
 * listing. It is not a check that the item is genuine." denies the
 * **meaning** a reader might take from a check, not an action anybody
 * performed, and the denial can sit a clause away from the words that
 * triggered the pattern. A short window would fail that honest sentence,
 * which is the mistake this whole family of guards keeps making.
 *
 * So: shared patterns get the shared, tighter check. These get this one.
 * Three sentences in the rooms depend on it, including that one.
 */
const NEGATED = /\b(not|never|neither|cannot|doesn't|does not|isn't|is not)\b/i;

/*
  Only what the shared table does not already say. A quieter duplicate of a
  shared claim is the drift that caused the move, so D8's "strongest sign"
  and "proof of fraud", D9's "proves ownership" and D10's "get your money
  back" are gone from here: WITHDRAWN_CLAIMS carries all four, in wider
  forms than these were.
*/
const RULES: Rule[] = [
  { rule: "D8", pattern: /(is|means) (a )?(scam|fraud)\b/i, instead: "name what was seen, not what the person is" },
  // What Pay Pals inferred is a risk signal, never a fact about what the seller is going to do.
  { rule: "D8", pattern: /(this|that) is the pattern of/i, instead: 'say the flags are "a risk signal", and what to ask' },
  { rule: "D8", pattern: /\b(never ships|a trick to get your money)\b/i, instead: "name the flag, not what you think the seller will do" },
  { rule: "D9", pattern: /\b(item|console|card|slab) is (authentic|genuine)\b/i, instead: "say what was checked and against what", unless: NEGATED },
  { rule: "D9", pattern: /\bauthenticated\b/i, instead: "say what was compared" },
  // Provenance: since contracts v1.8.0 the claim is allowed, but only off observed.serialSource.
  // The plural forms stay banned because no field says a whole set of photos was read.
  { rule: "D9", pattern: /read\b[^.]{0,40}\boff (the |these )?(arrival )?(photos|pictures|them)\b/i, instead: "read observed.serialSource and say what it says, one photo at a time" },
  { rule: "D10", pattern: /\bguarantee[sd]?\b/i, instead: 'say the pack is "useful context for a PayPal dispute"' },
  { rule: "D10", pattern: /(win|wins|winning) (the |a )?dispute/i, instead: "PayPal decides a dispute under its own terms" },
  { rule: "D10", pattern: /protection applies\b/i, instead: 'say protection "can apply"' },
  { rule: "D11", pattern: /(dispute|refund)s? (requires?|needs?|depends? on) (the |this )?(chain|hash|history)/i, instead: "a dispute or a refund does not depend on the chain" },
  { rule: "D11", pattern: /without (the |this )?(chain|hash)[^.]{0,40}(no|cannot) (refund|dispute)/i, instead: "a dispute or a refund does not depend on the chain" },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function sources(): { rel: string; text: string }[] {
  const files: { rel: string; text: string }[] = [];
  for (const dir of SCAN) {
    for (const file of walk(path.join(ROOT, dir))) {
      files.push({ rel: path.relative(ROOT, file).split(path.sep).join("/"), text: readFileSync(file, "utf8") });
    }
  }
  return files;
}

describe("the wording rules", () => {
  it("finds files to check", () => {
    expect(sources().length).toBeGreaterThan(40);
  });

  /*
    The shared policy, read rather than copied. One table, one negator list,
    contractions included, and every match checked so one honest denial does
    not launder a bare claim later in the same line.
  */
  it("breaks none of the claims this product has withdrawn", () => {
    const offenders = sources().flatMap(({ rel, text }) =>
      text.split("\n").flatMap((line, i) =>
        withdrawnClaimsIn(line).map((claim) => `${rel}:${i + 1} [${claim.id}] ${line.trim()}\n    because ${claim.why}\n    instead ${claim.instead}`),
      ),
    );
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("reads the shared table rather than keeping a quieter copy of it", () => {
    // The drift that caused the move: a claim forbidden in one guard and allowed
    // in another. If this guard could still pass a claim the shared table catches,
    // the move achieved nothing.
    expect(withdrawnClaimsIn("A matching cert proves the seller owns it.").map((c) => c.id)).toEqual(["D9"]);
    expect(withdrawnClaimsIn("That doesn't prove the seller has it.")).toEqual([]);
    // And the honest sentence the rooms actually print.
    expect(withdrawnClaimsIn("Cert 72096346 matches PSA's record. The slab exists. That doesn't prove the seller has it.")).toEqual([]);
  });

  for (const { rule, pattern, instead, unless } of RULES) {
    it(`${rule}: nothing in apps/web matches ${pattern}, ${instead}`, () => {
      const offenders = sources()
        .flatMap(({ rel, text }) =>
          text
            .split("\n")
            .map((line, i) => ({ rel, line, n: i + 1 }))
            .filter(({ line }) => pattern.test(line) && !(unless && unless.test(line))),
        )
        .map(({ rel, n, line }) => `${rel}:${n} ${line.trim()}`);
      expect(offenders).toEqual([]);
    });
  }

  it("has no em dash anywhere in apps/web, in copy or in a comment", () => {
    const offenders = sources()
      .flatMap(({ rel, text }) =>
        text
          .split("\n")
          .map((line, i) => ({ rel, line, n: i + 1 }))
          .filter(({ line }) => line.includes("—")),
      )
      .map(({ rel, n }) => `${rel}:${n}`);
    expect(offenders).toEqual([]);
  });

  it("keeps the sentences the rules ask for where they belong", () => {
    const all = sources();
    const find = (needle: string) => all.some(({ text }) => text.includes(needle));
    // D8 on the landing page, D9 on the item card and the status view, D10 and D11 in the pack.
    expect(find("A refusal to use Pay Pals is a risk signal.")).toBe(true);
    expect(find("supports the listing")).toBe(true);
    expect(find("useful context for a PayPal dispute")).toBe(true);
    expect(find("official record of the deal")).toBe(true);
    expect(find("A dispute or a refund does not")).toBe(true);
  });
});
