/**
 * "Confirmed by PayPal" is the strongest claim the product makes, so it has
 * one producer and this test is what keeps it that way.
 *
 * It was not always one producer. The evidence pack carried a second copy of
 * the words, hard-coded in the branch for a deal with no payment at all, so
 * a deal PayPal had never heard of printed the heading over a sentence
 * saying no payment was made. The words were right in the branch that could
 * never reach them and wrong in the branch nobody had tested.
 *
 * Two guards, because a convention is not an invariant:
 *   1. The literal appears in exactly one module in apps/web.
 *   2. In that module, describeRead returns it for the confirmed read and
 *      for no other kind, checked over every kind the union allows.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIRMED_HEADING, describeRead, readOrderFields, type PayPalReadResult } from "./paypal-confirmation";

const ROOT = path.resolve(__dirname, "..", "..");
const SCAN = ["app", "components", "lib"];
/** The only module allowed to write the words. Everything else asks describeRead for them. */
const PRODUCER = "lib/deal/paypal-confirmation.ts";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * Comments out, because the rule is about producing the string and not
 * about explaining it: the modules that route the heading say in prose why
 * it is the strongest claim on the page, and that writing is worth keeping.
 * Block comments and JSX comments go, and so does a line that is only a
 * comment. A trailing `//` on a line of code is left alone, because cutting
 * at the first `//` would also cut at the one in an https:// URL and could
 * hide a real occurrence after it.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
}

/** Source files that ship, so a test asserting on the heading is not an offender. */
function shippedSources(): { rel: string; text: string }[] {
  const files: { rel: string; text: string }[] = [];
  for (const dir of SCAN) {
    for (const file of walk(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      if (/\.test\.tsx?$/.test(rel)) continue;
      files.push({ rel, text: withoutComments(readFileSync(file, "utf8")) });
    }
  }
  return files;
}

describe("the words cannot be written anywhere else", () => {
  it("finds the files to scan", () => {
    const files = shippedSources();
    expect(files.length).toBeGreaterThan(40);
    expect(files.some((f) => f.rel === PRODUCER)).toBe(true);
  });

  it("has exactly one module in apps/web carrying the literal", () => {
    const carriers = shippedSources()
      .filter(({ text }) => text.includes(CONFIRMED_HEADING))
      .map(({ rel }) => rel);
    expect(carriers).toEqual([PRODUCER]);
  });

  it("names the producer, so the message says where to put it instead", () => {
    const offenders = shippedSources().filter(({ rel, text }) => rel !== PRODUCER && text.includes(CONFIRMED_HEADING));
    expect(
      offenders.map(({ rel }) => `${rel} writes "${CONFIRMED_HEADING}" itself; ask describeRead for the heading instead`),
    ).toEqual([]);
  });
});

describe("describeRead gives the words to the confirmed read and to nothing else", () => {
  const order = readOrderFields({ id: "2NW245573K1279237", status: "COMPLETED" });
  // Every kind the union allows. Adding a kind to PayPalReadResult without adding it here
  // stops compiling, so a new branch cannot slip past this check.
  const everyKind: Record<PayPalReadResult["kind"], PayPalReadResult> = {
    confirmed: { kind: "confirmed", order },
    example: { kind: "example" },
    mock: { kind: "mock" },
    failed: { kind: "failed" },
    none: { kind: "none" },
  };

  it("says it for a live read", () => {
    const described = describeRead(everyKind.confirmed);
    expect(described.heading).toBe(CONFIRMED_HEADING);
    expect(described.confirmed).toBe(true);
  });

  it("says it for no other kind, and never flags one as confirmed", () => {
    for (const [kind, result] of Object.entries(everyKind) as [PayPalReadResult["kind"], PayPalReadResult][]) {
      if (kind === "confirmed") continue;
      const described = describeRead(result);
      expect(described.heading, kind).not.toBe(CONFIRMED_HEADING);
      expect(described.heading, kind).not.toContain(CONFIRMED_HEADING);
      expect(described.confirmed, kind).toBe(false);
    }
  });

  it("keeps heading and confirmed in step, whichever way a caller reads them", () => {
    for (const result of Object.values(everyKind)) {
      const described = describeRead(result);
      expect(described.heading === CONFIRMED_HEADING).toBe(described.confirmed);
    }
  });
});
