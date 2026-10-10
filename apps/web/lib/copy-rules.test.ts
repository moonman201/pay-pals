/**
 * The wording rules, as a test, so a phrase we took out cannot come back in.
 *
 *  D8  Refusing Pay Pals is a risk signal. Never the strongest warning sign,
 *      never the strongest sign, never proof of fraud.
 *  D9  A matching serial or cert supports the listing. It never proves
 *      ownership or authenticity, and "authentic" is never a claim about the
 *      item.
 *  D10 The evidence pack is useful context for a PayPal dispute. Never a
 *      guaranteed or likely outcome.
 *  D11 The audit chain is the official record of the deal that PayPal can
 *      check first. Never that a refund or a dispute requires it.
 *
 * Plus Matt's rule for every user-facing string: no em dashes.
 */
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

/** "not a check that the item is genuine" is the sentence the rules want, not a breach of them. */
const NEGATED = /\b(not|never|neither|cannot)\b/i;

const RULES: Rule[] = [
  { rule: "D8", pattern: /strongest (warning )?sign/i, instead: 'say a refusal is "a risk signal"' },
  { rule: "D8", pattern: /proof of (fraud|a scam)/i, instead: "a refusal is a risk signal, not proof of anything" },
  { rule: "D8", pattern: /(is|means) (a )?(scam|fraud)\b/i, instead: "name what was seen, not what the person is" },
  // What Pay Pals inferred is a risk signal, never a fact about what the seller is going to do.
  { rule: "D8", pattern: /(this|that) is the pattern of/i, instead: 'say the flags are "a risk signal", and what to ask' },
  { rule: "D8", pattern: /\b(never ships|a trick to get your money)\b/i, instead: "name the flag, not what you think the seller will do" },
  { rule: "D9", pattern: /prove[sd]? (the )?(ownership|authenticity|it is genuine)/i, instead: 'say the number "supports the listing"' },
  { rule: "D9", pattern: /\b(item|console|card|slab) is (authentic|genuine)\b/i, instead: "say what was checked and against what", unless: NEGATED },
  { rule: "D9", pattern: /\bauthenticated\b/i, instead: "say what was compared" },
  // Provenance: ArrivalCheck.observed carries no source for the serial, so nothing in apps/web
  // may say a number was read off a picture. In demo-only mode it came from the caption.
  { rule: "D9", pattern: /read\b[^.]{0,40}\boff (the |these )?(arrival )?(photos|pictures|them|it)\b/i, instead: "say what was compared, not where the number came from" },
  { rule: "D10", pattern: /\bguarantee[sd]?\b/i, instead: 'say the pack is "useful context for a PayPal dispute"' },
  { rule: "D10", pattern: /(win|wins|winning) (the |a )?dispute/i, instead: "PayPal decides a dispute under its own terms" },
  { rule: "D10", pattern: /(get|gets) your money back/i, instead: "say what protection covers and who decides" },
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
