/**
 * Refuses to start a run when something is already listening on the port the
 * suite wants, and says what to do about it.
 *
 * Playwright refuses too, now that reuse is opt-in, but its message is
 * "set reuseExistingServer:true in config.webServer", which is the one
 * change that would put the old problem back. This runs first, from the
 * npm scripts everyone actually types, and gives the right advice instead.
 */
import { createConnection } from "node:net";
import { PORT } from "../src/env";
import { REAL_PORT } from "../src/real-env";
import { REUSE_SERVER } from "../src/server-mode";

const WHICH = process.argv[2] === "real" ? "real" : "demo";
const port = WHICH === "real" ? REAL_PORT : PORT;

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

if (process.env.E2E_BASE_URL) {
  // Pointed at a server somewhere else on purpose. Nothing to protect.
  process.exit(0);
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
  `[e2e] port ${port} is already in use, so this run would have to reuse a server it did not start.\n` +
    `      A server left from an earlier run serves whatever it had compiled, so the suite could pass against code that is not in this working tree.\n` +
    `      Stop it and run again:  kill $(lsof -ti tcp:${port})\n` +
    `      A run that was interrupted can leave a next-server behind that lsof does not always show; "ps aux | grep next-server" finds it.\n` +
    `      For the fast local loop, and knowing all of the above, run with E2E_REUSE_SERVER=1.\n` +
    `      Do not turn reuseExistingServer back on in the config: that default is what this guard replaces.`,
);
process.exit(1);
