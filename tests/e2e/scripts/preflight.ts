/**
 * Refuses to start a run when something is already listening on a port the
 * caller pinned, and says what to do about it.
 *
 * Only a pinned port is guarded. A port nobody asked for is this worktree's
 * own, chosen free at config load (src/port.ts), and if it is taken the
 * config simply steps to the next one: that is not a situation anyone needs
 * to be told about. A pinned port is different. The caller named it, so
 * something already on it is either a server from an interrupted run, whose
 * old compile would be what the suite tested, or another lane's server. Both
 * deserve a stop.
 *
 * Playwright refuses too, now that reuse is opt-in, but its message is
 * "set reuseExistingServer:true in config.webServer", which is the one
 * change that would put the old problem back. This runs first, from the npm
 * scripts everyone actually types, and gives the right advice instead.
 */
import { createConnection } from "node:net";
import { REUSE_SERVER } from "../src/server-mode";

const WHICH = process.argv[2] === "real" ? "real" : "demo";
const pinned = WHICH === "real" ? process.env.E2E_REAL_PORT : process.env.E2E_PORT;
const variable = WHICH === "real" ? "E2E_REAL_PORT" : "E2E_PORT";

function isListening(onPort: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port: onPort, host: "127.0.0.1" });
    const done = (answer: boolean) => {
      socket.destroy();
      resolve(answer);
    };
    socket.setTimeout(1000);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

// Pointed at a server somewhere else on purpose, or on a port the run picks for itself.
if (process.env.E2E_BASE_URL || !pinned) process.exit(0);

const port = Number(pinned);
if (!Number.isInteger(port) || port <= 0) {
  console.error(`[e2e] ${variable} is set to "${pinned}", which is not a port.`);
  process.exit(1);
}

if (!(await isListening(port))) process.exit(0);

if (REUSE_SERVER) {
  console.log(
    `[e2e] something is already listening on port ${port} and E2E_REUSE_SERVER=1, so this run will use it. ` +
      `Whatever it has compiled is what gets tested.`,
  );
  process.exit(0);
}

console.error(
  `[e2e] ${variable}=${port} is pinned and something is already listening on it, so this run would have to reuse a server it did not start.\n` +
    `      A server left from an earlier run serves whatever it had compiled, so the suite could pass against code that is not in this working tree.\n` +
    `      Stop it and run again:  kill $(lsof -ti tcp:${port})\n` +
    `      A run that was interrupted can leave a next-server behind that lsof does not always show; "ps aux | grep next-server" finds it.\n` +
    `      Or unset ${variable} and let the run pick a free port of this worktree's own.\n` +
    `      For the fast local loop, and knowing all of the above, run with E2E_REUSE_SERVER=1.\n` +
    `      Do not turn reuseExistingServer back on in the config: that default is what this guard replaces.`,
);
process.exit(1);
