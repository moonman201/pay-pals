/**
 * Parses the command line for scripts/delete-seeded-demo-deals.ts. Kept apart
 * from the script so the argument handling can be tested: it decides which
 * deals a destructive run will touch, which is the last place to find out a
 * flag was read the way you did not mean.
 *
 * Two rules carry the safety here, and both exist because of a real near-miss
 * (WORKLOG Oct 11). An argument list built with `sed 's/^/--id /'` arrived as
 * one single argument, because zsh does not split an unquoted variable into
 * words. The old parser scanned for the patterns it knew and ignored anything
 * else, so it matched no ids, fell through to the sweep, and offered to delete
 * the three live demo seeds while reporting success.
 *
 * 1. Every argument must be recognised. Unknown flags and stray values are
 *    refused rather than skipped. A parser that ignores what it does not
 *    understand cannot tell "no ids were given" from "the ids did not arrive",
 *    and those two want opposite answers.
 *
 * 2. The mode is named, never inferred. There is no fallback mode, so no
 *    malformed invocation can land in the destructive one by default.
 *
 * A whitelist is what this needs rather than a check for the one bad shape:
 * `--kep-seed 2026-10-08.1 --yes` was the same bug with no "--id" in it
 * anywhere, and it would have swept with nothing kept.
 *
 * Each --id is its own flag, repeated. There is no comma list and no prefix
 * form, so every deal a by-id run deletes is spelled out on the command line.
 */

export type DeleteCliArgs =
  | { mode: "explain"; dealId: string; keepSeedVersion: string | null }
  | { mode: "by-id"; ids: string[]; yes: boolean }
  | { mode: "sweep"; keepSeedVersion: string | null; yes: boolean }
  | { mode: "error"; message: string };

/** --keep-seed none says "keep no seed at all", so the destructive sweep is spelled out. */
export const KEEP_NOTHING = "none";

const BOOLEAN_FLAGS = ["yes", "sweep"] as const;
const VALUE_FLAGS = ["keep-seed", "explain", "id"] as const;

const USAGE = "Name a mode: --sweep, --id <uuid>, or --explain <dealId>.";

const error = (message: string): DeleteCliArgs => ({ mode: "error", message });

/** Keeps an unsplit argument list from filling the terminal when it is quoted back. */
function shorten(value: string): string {
  return value.length <= 48 ? value : `${value.slice(0, 45)}...`;
}

/**
 * An unknown argument that has flags buried inside it is an unsplit list, not a
 * typo, so it gets the answer that actually helps.
 */
function unknownArgument(arg: string): DeleteCliArgs {
  const buried = [...VALUE_FLAGS, ...BOOLEAN_FLAGS].filter((name) => arg.includes(`--${name}`)).length;
  if (buried > 0 && arg.includes(" ")) {
    return error(
      `One argument contains a whole list of flags: "${shorten(arg)}". ` +
        "Nothing was deleted. This happens when a variable holding the arguments is not split into words: " +
        "zsh leaves $ARGS as a single word, so use ${=ARGS}, or pass the flags directly.",
    );
  }
  return error(`Unrecognised argument: "${shorten(arg)}". Nothing was deleted. ${USAGE}`);
}

interface Collected {
  yes: boolean;
  sweep: boolean;
  keepSeedVersion?: string;
  explainId?: string;
  ids: string[];
}

/** Walks argv, refusing anything it does not recognise. */
function collect(argv: readonly string[]): Collected | DeleteCliArgs {
  const found: Collected = { yes: false, sweep: false, ids: [] };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;

    if (arg === "--yes") {
      found.yes = true;
      continue;
    }
    if (arg === "--sweep") {
      found.sweep = true;
      continue;
    }

    // A value flag, either "--name value" or "--name=value".
    const name = VALUE_FLAGS.find((n) => arg === `--${n}` || arg.startsWith(`--${n}=`));
    if (name !== undefined) {
      let value: string | undefined;
      if (arg === `--${name}`) {
        const next = argv[i + 1];
        // A following flag is not a value: this is how "--id --yes" is caught.
        if (next !== undefined && !next.startsWith("--")) {
          value = next;
          i++;
        }
      } else {
        value = arg.slice(`--${name}=`.length);
      }
      if (value === undefined || value.length === 0) {
        if (name === "id") return error("--id needs a full deal uuid, for example --id 3e28036c-77f1-49e1-9f5d-f9184fcdbf84");
        if (name === "keep-seed") return error(`--keep-seed needs a version, for example --keep-seed 2026-10-08.1, or --keep-seed ${KEEP_NOTHING} to keep none.`);
        return error("--explain needs a deal id.");
      }
      if (name === "id") {
        found.ids.push(value);
      } else if (name === "keep-seed") {
        if (found.keepSeedVersion !== undefined) return error("--keep-seed was given more than once. Pass it once.");
        found.keepSeedVersion = value;
      } else {
        if (found.explainId !== undefined) return error("--explain was given more than once. Pass it once.");
        found.explainId = value;
      }
      continue;
    }

    return unknownArgument(arg);
  }

  return found;
}

export function parseDeleteCliArgs(argv: readonly string[]): DeleteCliArgs {
  const collected = collect(argv);
  if ("mode" in collected) return collected;
  const { yes, sweep, keepSeedVersion, explainId, ids } = collected;

  // One mode per run. Two named modes is an ambiguity, not an order of precedence.
  const named = [explainId !== undefined && "--explain", ids.length > 0 && "--id", sweep && "--sweep"].filter(Boolean) as string[];
  if (named.length > 1) return error(`${named.join(" and ")} cannot be used in the same run. Pass one mode.`);
  if (named.length === 0) return error(`No mode given, so nothing was done. ${USAGE}`);

  if (explainId !== undefined) {
    return { mode: "explain", dealId: explainId, keepSeedVersion: keepSeedVersion === KEEP_NOTHING ? null : keepSeedVersion ?? null };
  }

  if (ids.length > 0) {
    // --keep-seed protects seeds from the sweep and does nothing here. Refusing
    // the combination is better than running it and looking like it applied.
    if (keepSeedVersion !== undefined) return error("--keep-seed has no effect with --id. Run --sweep for seeds, or drop --keep-seed to delete these ids.");
    return { mode: "by-id", ids, yes };
  }

  // Deleting with the sweep has to say what it keeps. Without this, forgetting
  // --keep-seed is a silent "keep nothing", which is how the live demo seeds go.
  if (yes && keepSeedVersion === undefined) {
    return error(`--sweep --yes needs --keep-seed <version> to say which seeds to keep, or --keep-seed ${KEEP_NOTHING} to delete every stamped seed including the live ones.`);
  }
  return { mode: "sweep", keepSeedVersion: keepSeedVersion === KEEP_NOTHING ? null : keepSeedVersion ?? null, yes };
}
