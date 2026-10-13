/**
 * The logic behind `npm run demo:seed -w apps/web`: argument parsing and the
 * per-scenario run, kept out of the script so both can be tested. The script
 * wires the real store and pals; this file only decides what to do and what
 * to print. Nothing here reads the environment.
 */
import { ALL_FIXTURES, SCENARIO_IDS, type ScenarioId } from "@pay-pals/contracts";
import { seedScenarioIfMissing, type DealFinder, type ReplayTime, type SeedOutcome } from "./seed-fixtures";
import type { Services } from "../services";

export interface SeedArgs {
  base: string | null;
  only: ScenarioId[];
}

export type ParsedSeedArgs = { ok: true; args: SeedArgs } | { ok: false; message: string };

export function parseSeedArgs(argv: readonly string[]): ParsedSeedArgs {
  let base: string | null = null;
  const only: ScenarioId[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    const take = (name: string): string | null => {
      if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
      i += 1;
      return argv[i] ?? null;
    };
    if (arg === "--base" || arg.startsWith("--base=")) {
      const value = take("--base");
      if (!value || !/^https?:\/\/[^/\s]+/i.test(value)) return { ok: false, message: "--base needs a full URL, such as https://pay-pals-m00n1.vercel.app" };
      base = value.replace(/\/+$/, "");
    } else if (arg === "--only" || arg.startsWith("--only=")) {
      const value = take("--only");
      if (!value || !(SCENARIO_IDS as readonly string[]).includes(value)) return { ok: false, message: `--only needs one of: ${SCENARIO_IDS.join(", ")}` };
      only.push(value as ScenarioId);
    } else {
      return { ok: false, message: `Unknown argument "${arg}". Usage: npm run demo:seed -w apps/web -- [--base <url>] [--only <scenario>]` };
    }
  }
  return { ok: true, args: { base, only } };
}

export interface SeedLine {
  scenario: ScenarioId;
  outcome: SeedOutcome["outcome"] | "failed";
  dealId: string | null;
  ms: number;
  error?: string;
}

type SeedServices = Pick<Services, "store" | "buyerPal" | "buildEvidencePack" | "demoPayee" | "clock">;

/** Seeds each wanted scenario in turn. A failure is recorded and the run goes on, so one bad scenario does not hide the others. */
export async function runSeed(
  services: SeedServices,
  finder: DealFinder,
  only: readonly ScenarioId[],
  log: (line: string) => void,
  time: ReplayTime,
  now: () => number = Date.now,
): Promise<SeedLine[]> {
  const lines: SeedLine[] = [];
  for (const fixture of ALL_FIXTURES) {
    if (only.length > 0 && !only.includes(fixture.id)) continue;
    const started = now();
    try {
      const result = await seedScenarioIfMissing(services, finder, fixture, log, time, started);
      lines.push({ scenario: fixture.id, outcome: result.outcome, dealId: result.dealId, ms: now() - started });
    } catch (error) {
      lines.push({ scenario: fixture.id, outcome: "failed", dealId: null, ms: now() - started, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return lines;
}

const WORDS: Record<SeedLine["outcome"], string> = {
  seeded: "seeded now",
  existing: "already there, skipped",
  stale: "STALE seed from an older version, not replaced (run the sweep first)",
  failed: "FAILED",
};

export function formatSeedLine(line: SeedLine): string {
  const id = line.dealId ? ` ${line.dealId}` : "";
  const why = line.error ? `: ${line.error}` : "";
  return `${line.scenario.padEnd(10)} ${WORDS[line.outcome]}${id} (${(line.ms / 1000).toFixed(1)} s)${why}`;
}

/** Exit code for a run: 0 only when every scenario is seeded or already current. */
export function seedExitCode(lines: readonly SeedLine[]): number {
  return lines.length > 0 && lines.every((l) => l.outcome === "seeded" || l.outcome === "existing") ? 0 : 1;
}
