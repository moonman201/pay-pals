/**
 * Which port a run's server listens on.
 *
 * Every worktree used to default to 3100, so two lanes running Playwright at
 * the same time took each other's server. That used to degrade quietly,
 * because the configs reused whatever was listening; now that reuse is off
 * it is a hard red, and one lane went as far as killing processes on 3100
 * that belonged to another worktree.
 *
 * So the default is a port of this worktree's own: a base derived from the
 * checkout path, then the first free port at or above it. Two worktrees
 * almost never start from the same base, and if they do, the second one
 * steps past the first. `E2E_PORT` (or `E2E_REAL_PORT`) still pins a port
 * exactly, and a pinned port that is busy is an error rather than something
 * to step around: see scripts/preflight.ts.
 */
import { execFileSync } from "node:child_process";

export interface ChosenPort {
  port: number;
  /** True when the caller pinned it with an environment variable. */
  pinned: boolean;
}

/** Stable small number from a string. Same checkout, same base, every run. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * The first port from `from` upwards that nothing is listening on, probed in
 * a child process so this can be answered synchronously while a Playwright
 * config is still being read. Binds the way a Node server does, so a port
 * taken on IPv6 only is not reported free. Falls back to `from` if the whole
 * window is busy, which then fails loudly at startup instead of silently
 * sharing someone else's server.
 */
function firstFreePort(from: number, window: number): number {
  const probe = `
    const net = require("node:net");
    const from = Number(process.argv[1]);
    const window = Number(process.argv[2]);
    (async () => {
      for (let port = from; port < from + window; port++) {
        const free = await new Promise((resolve) => {
          const server = net.createServer();
          server.once("error", () => resolve(false));
          server.listen(port, () => server.close(() => resolve(true)));
        });
        if (free) return process.stdout.write(String(port));
      }
      process.stdout.write(String(from));
    })();
  `;
  try {
    const answer = execFileSync(process.execPath, ["-e", probe, String(from), String(window)], { encoding: "utf8", timeout: 10_000 });
    const port = Number(answer.trim());
    return Number.isInteger(port) && port > 0 ? port : from;
  } catch {
    return from;
  }
}

/**
 * `pinnedValue` is the environment variable's value, if it is set. Otherwise
 * a free port from this worktree's own base inside `[low, low + span)`.
 */
export function choosePort(pinnedValue: string | undefined, repoRoot: string, low: number, span: number): ChosenPort {
  const pinned = Number(pinnedValue);
  if (Number.isInteger(pinned) && pinned > 0) return { port: pinned, pinned: true };
  return { port: firstFreePort(low + (hash(repoRoot) % span), 40), pinned: false };
}
