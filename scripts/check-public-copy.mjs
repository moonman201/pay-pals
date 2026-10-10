/**
 * Guards the claims in every tracked Markdown file, which the two code guards
 * do not read.
 *
 * `apps/web/lib/copy-rules.test.ts` scans .ts and .tsx under app, components
 * and lib. `packages/agents/src/house-words.test.ts` scans .ts under that
 * package. Between them they cover the code and none of the prose, so on
 * 2026-10-10 reality-check dropped a file holding five forbidden sentences
 * into both of their scan roots and both suites stayed green. Every file in
 * docs/ and coordination/ goes public at submission, and the README and the
 * ADRs are the files a judge is most likely to read closely.
 *
 * The rules are Matt's batch items D8 to D11. A phrase may be named in order
 * to forbid it or to withdraw it, which is why ALLOWED exists and why every
 * entry in it has to carry a reason.
 *
 * Usage: node scripts/check-public-copy.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** D8 to D11. Each pattern is the claim, not the wording, so rephrasing does not escape it. */
const RULES = [
  { id: "D8", why: "refusing Pay Pals is a risk signal, never the strongest sign and never proof of fraud", patterns: [/strongest (scam sign|sign|warning sign|stop)/i, /proof of (fraud|a scam)/i] },
  { id: "D9", why: "a serial or cert supports the listing; it never proves ownership or authenticity", patterns: [/proves? (ownership|authenticity|the seller owns)/i, /verified (authentic|owner|genuine)/i, /proves (it is|they are) (genuine|authentic)/i] },
  { id: "D10", why: "the evidence pack is useful context for a dispute, never a guaranteed outcome", patterns: [/guarantees? (a )?(refund|outcome|win)/i, /get your money back/i, /will (win|be refunded)/i] },
  { id: "D11", why: "the audit chain is the official record PayPal can check first; a refund or dispute never requires it", patterns: [/(refund|dispute) requires (the|this|our)/i, /required for a (refund|dispute)/i] },
];

/**
 * Deliberate, reviewed exceptions. A file that states a rule, or that keeps an
 * original wording alongside a dated amendment withdrawing it, is correct.
 * Adding a line here is a decision: say who made it and why.
 */
const ALLOWED = [
  { file: "coordination/PLAN.md", why: "states the wording rules themselves, and records Matt's decisions in his words" },
  { file: "coordination/REQUEST.md", why: "Matt's original product request, kept verbatim with dated amendments beneath the withdrawn claims (D8 at line 10, D11 at the tamper paragraph)" },
  { file: "coordination/REVIEW.md", why: "findings quote the copy they are findings about" },
  { file: "coordination/WORKLOG.md", why: "append-only record; entries quote the phrases they report withdrawing" },
  { file: "coordination/PROPOSAL-contracts-v1.7.0.md", why: "quotes Matt's batch wording while proposing the change" },
  { file: "docs/adr/0003-buyer-first-cert-check-and-tamper-evident-history.md", why: "decision record kept as written, with dated amendments under decisions 2 and 4" },
  { file: "CHANGELOG.md", why: "the Oct 10 entry records the claims that were withdrawn, so it has to name them" },
  { file: "scripts/check-public-copy.mjs", why: "this file is the rule list" },
];

const tracked = execFileSync("git", ["ls-files", "*.md"], { encoding: "utf8" }).split("\n").filter(Boolean);
const allowed = new Set(ALLOWED.map((a) => a.file));

const breaches = [];
for (const file of tracked) {
  if (allowed.has(file)) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((text, i) => {
    for (const rule of RULES) {
      // First matching rule is enough: one line is one breach, however many patterns catch it.
      if (rule.patterns.some((pattern) => pattern.test(text))) {
        breaches.push({ file, line: i + 1, rule, text: text.trim() });
        break;
      }
    }
  });
}

if (breaches.length === 0) {
  console.log(`[copy] ${tracked.length - allowed.size} Markdown files checked against D8 to D11, ${allowed.size} on the reviewed exception list. Clean.`);
  process.exit(0);
}

console.error(`[copy] ${breaches.length} claim${breaches.length === 1 ? "" : "s"} this repo has withdrawn:\n`);
for (const b of breaches) {
  console.error(`  ${b.file}:${b.line}  (${b.rule.id})`);
  console.error(`    ${b.text}`);
  console.error(`    ${b.rule.why}\n`);
}
console.error("Reword it, or add the file to ALLOWED in scripts/check-public-copy.mjs with a reason if the phrase is there to be forbidden or withdrawn.");
process.exit(1);
