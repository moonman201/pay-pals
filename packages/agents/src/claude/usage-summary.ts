/**
 * Totals a usage log by call site and prices it at Sonnet 5 rates.
 * Run: npm run usage:summary -w packages/agents -- <file>
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_USAGE_LOG, type UsageLine } from "./usage-log";

/** Dollars per million tokens. Cache writes are 1.25x input, reads 0.1x. */
export const RATES = { input: 2, cacheWrite: 2.5, cacheRead: 0.2, output: 10 } as const;

export interface SiteTotal {
  calls: number;
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
  cost: number;
}

export function costOf(t: Pick<SiteTotal, "input" | "cacheWrite" | "cacheRead" | "output">): number {
  return (t.input * RATES.input + t.cacheWrite * RATES.cacheWrite + t.cacheRead * RATES.cacheRead + t.output * RATES.output) / 1_000_000;
}

export function parseLines(text: string): UsageLine[] {
  const lines: UsageLine[] = [];
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    try {
      lines.push(JSON.parse(raw) as UsageLine);
    } catch {
      // Skip a torn line.
    }
  }
  return lines;
}

export function totalsBySite(lines: UsageLine[]): Map<string, SiteTotal> {
  const totals = new Map<string, SiteTotal>();
  for (const line of lines) {
    const t = totals.get(line.site) ?? { calls: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0, cost: 0 };
    t.calls += 1;
    t.input += line.input_tokens ?? 0;
    t.cacheWrite += line.cache_creation_input_tokens ?? 0;
    t.cacheRead += line.cache_read_input_tokens ?? 0;
    t.output += line.output_tokens ?? 0;
    t.cost = costOf(t);
    totals.set(line.site, t);
  }
  return totals;
}

export function formatSummary(totals: Map<string, SiteTotal>): string {
  const rows = [...totals.entries()].sort((a, b) => b[1].cost - a[1].cost);
  const all: SiteTotal = { calls: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0, cost: 0 };
  const out = ["site                 calls     input  cache_write  cache_read    output   est_cost"];
  const row = (name: string, t: SiteTotal) =>
    `${name.padEnd(20)} ${String(t.calls).padStart(5)} ${String(t.input).padStart(9)} ${String(t.cacheWrite).padStart(12)} ${String(t.cacheRead).padStart(11)} ${String(t.output).padStart(9)} ${`$${t.cost.toFixed(4)}`.padStart(10)}`;
  for (const [name, t] of rows) {
    out.push(row(name, t));
    all.calls += t.calls;
    all.input += t.input;
    all.cacheWrite += t.cacheWrite;
    all.cacheRead += t.cacheRead;
    all.output += t.output;
  }
  all.cost = costOf(all);
  out.push(row("TOTAL", all));
  out.push("Rates per MTok: input $2, cache write $2.50, cache read $0.20, output $10.");
  return out.join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = process.argv[2] ?? DEFAULT_USAGE_LOG;
  try {
    console.log(formatSummary(totalsBySite(parseLines(readFileSync(file, "utf8")))));
  } catch {
    console.error(`No usage log at ${file}. Set PAY_PALS_LOG_USAGE=1 and make some calls first.`);
    process.exitCode = 1;
  }
}
