/**
 * Global setup for the real-mode config, whose only setup is to say which
 * server the run is about to spend sandbox and Claude calls against. The
 * demo config does the same from its own global setup, which has a warm-up
 * to do as well.
 */
import { REAL_BASE_URL, REAL_PORT_PINNED, REAL_SKIP_BUILD, REAL_STARTS_SERVER } from "./real-env";
import { announceServer } from "./server-mode";

export default async function realGlobalSetup(): Promise<void> {
  announceServer({ label: "real-mode server", baseUrl: REAL_BASE_URL, startsServer: REAL_STARTS_SERVER, portPinned: REAL_PORT_PINNED });
  if (REAL_STARTS_SERVER && REAL_SKIP_BUILD) {
    console.log("[e2e] E2E_REAL_SKIP_BUILD=1: apps/web was not rebuilt, so this run tests the last build, not this working tree.");
  }
}
