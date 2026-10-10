/**
 * Which server a run talks to, and saying so out loud.
 *
 * Both configs used to reuse a server that was already listening: the demo
 * config whenever CI was unset, the real config always. A dev server left
 * over from an earlier run serves whatever it had compiled, so a suite could
 * pass against code that is not the code in the working tree, and nothing in
 * the output said which had happened. That is what this file exists to stop.
 *
 * The rule now: with no environment variables set, a run starts its own
 * server and reuses nothing. Reuse is the fast local loop, it has to be
 * asked for with `E2E_REUSE_SERVER=1`, and when it is asked for the banner
 * says what that does to the result.
 */

/**
 * Reuse a server this run did not start. Off unless asked for, because a run
 * cannot tell a stale compile from a fresh one, and a green suite that
 * proves nothing is worse than a red one.
 */
export const REUSE_SERVER = process.env.E2E_REUSE_SERVER === "1";

export interface ServerMode {
  /** What to call this run's server in the banner. */
  label: string;
  baseUrl: string;
  /** True when this config starts the server itself. */
  startsServer: boolean;
  /** True when the port came from an environment variable rather than being chosen free. */
  portPinned?: boolean;
}

/** One line naming the server and how much of this working tree is actually under test. */
export function serverBanner({ label, baseUrl, startsServer, portPinned }: ServerMode): string {
  const where = `[e2e] ${label}: ${baseUrl}`;
  if (!startsServer) return `${where}, not started by this run (E2E_BASE_URL is set). Nothing here is built from this working tree.`;
  const how = portPinned ? "port pinned" : "port chosen free for this worktree";
  if (REUSE_SERVER) {
    return (
      `${where} (${how}), reuse allowed (E2E_REUSE_SERVER=1). If a server was already listening, this run tested whatever that server ` +
      `had compiled, which may not be this working tree. Unset E2E_REUSE_SERVER before you believe a green run.`
    );
  }
  return `${where} (${how}), started by this run. Nothing was reused.`;
}

export function announceServer(mode: ServerMode): void {
  console.log(serverBanner(mode));
}
