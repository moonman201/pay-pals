/**
 * Parses the command line for scripts/delete-seeded-demo-deals.ts. Kept apart
 * from the script so the argument handling can be tested: it decides which
 * deals a destructive run will touch, which is the last place to find out a
 * flag was read the way you did not mean.
 *
 * Each --id is its own flag, repeated. There is no comma list and no prefix
 * form, so every deal a by-id run deletes is spelled out on the command line.
 */

export type DeleteCliArgs =
  | { mode: "explain"; dealId: string; keepSeedVersion: string | null }
  | { mode: "by-id"; ids: string[]; yes: boolean }
  | { mode: "sweep"; keepSeedVersion: string | null; yes: boolean }
  | { mode: "error"; message: string };

/** A flag, not a value. Catches "--id --yes", where the id was left out. */
const isFlag = (value: string | undefined): boolean => value === undefined || value.startsWith("--");

function valueFor(argv: readonly string[], name: string): { value?: string; missing: boolean } {
  const index = argv.indexOf(`--${name}`);
  if (index >= 0) {
    const next = argv[index + 1];
    return isFlag(next) ? { missing: true } : { value: next, missing: false };
  }
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline === undefined) return { missing: false };
  const value = inline.slice(`--${name}=`.length);
  return value.length === 0 ? { missing: true } : { value, missing: false };
}

function idsFrom(argv: readonly string[]): { ids: string[]; missing: boolean } {
  const ids: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--id") {
      if (isFlag(argv[i + 1])) return { ids, missing: true };
      ids.push(argv[i + 1]!);
      i++;
    } else if (arg.startsWith("--id=")) {
      const value = arg.slice("--id=".length);
      if (value.length === 0) return { ids, missing: true };
      ids.push(value);
    }
  }
  return { ids, missing: false };
}

export function parseDeleteCliArgs(argv: readonly string[]): DeleteCliArgs {
  const yes = argv.includes("--yes");

  const keep = valueFor(argv, "keep-seed");
  if (keep.missing) return { mode: "error", message: "--keep-seed needs a version, for example --keep-seed 2026-10-08.1" };
  const keepSeedVersion = keep.value ?? null;

  const explain = valueFor(argv, "explain");
  if (explain.missing) return { mode: "error", message: "--explain needs a deal id." };

  const { ids, missing } = idsFrom(argv);
  if (missing) return { mode: "error", message: "--id needs a full deal uuid, for example --id 3e28036c-77f1-49e1-9f5d-f9184fcdbf84" };

  // --explain only reads, so it answers first and never deletes.
  if (explain.value !== undefined) return { mode: "explain", dealId: explain.value, keepSeedVersion };

  if (ids.length > 0) {
    // --keep-seed protects seeds from the sweep and does nothing here. Refusing
    // the combination is better than running it and looking like it applied.
    if (keepSeedVersion !== null) return { mode: "error", message: "--keep-seed has no effect with --id. Run the sweep for seeds, or drop --keep-seed to delete these ids." };
    return { mode: "by-id", ids, yes };
  }

  return { mode: "sweep", keepSeedVersion, yes };
}
