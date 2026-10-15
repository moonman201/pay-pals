/**
 * Keep the server function alive until a promise settles, whatever the
 * client does.
 *
 * On Vercel a function can be frozen once its response has ended or the
 * client has gone, so a review that only lives in a promise might never
 * finish. `after()` from next/server registers the work with the platform
 * (waitUntil underneath), which holds the invocation open until it settles,
 * up to the route's maxDuration. Outside a request (unit tests, scripts)
 * `after` throws; there nothing freezes the process, so doing nothing is
 * right.
 */
import { after } from "next/server";

export function keepAliveUntil(work: Promise<unknown>): void {
  try {
    after(async () => {
      await work.catch(() => {});
    });
  } catch {
    /* not inside a request: the process stays up on its own */
  }
}
