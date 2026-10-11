/**
 * Smoke the deployed site: fetch the landing page, follow every finished-deal
 * link on it, and fail on anything but 200.
 *
 * Why this exists. On 2026-10-11 Matt opened the landing page and saw three
 * dead finished-deal links and a line of copy that had been removed hours
 * earlier. Every check I had run said the site was fine, and every one of them
 * was right about the thing it measured: each was a single fetch of the origin
 * at one moment, and none of them re-ran after the demo deals were re-seeded.
 * A check that passes before the event it is meant to catch is not a check.
 *
 * So this script is built to be run AFTER a deploy and AFTER any re-seed, and
 * it prints the cache headers it saw, because "the origin is correct" and "a
 * visitor sees the correct thing" are different claims and the headers are the
 * only evidence in the response that tells them apart.
 *
 * Usage:
 *   node scripts/smoke-production.mjs
 *   node scripts/smoke-production.mjs https://some-preview.vercel.app
 */

const BASE = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "https://pay-pals-m00n1.vercel.app").replace(/\/$/, "");

/** Claims this repo has withdrawn. Seeing one on the live page means stale HTML or a regression. */
const WITHDRAWN = [
  "strongest warning sign",
  "strongest scam sign",
  "sells for about",
  "could not be loaded",
];

const problems = [];
const notes = [];

function cacheLine(res) {
  const parts = ["x-vercel-cache", "age", "x-vercel-id"]
    .map((h) => (res.headers.get(h) ? `${h}=${res.headers.get(h)}` : null))
    .filter(Boolean);
  return parts.length ? parts.join(" ") : "no cache headers";
}

async function main() {
  console.log(`[smoke] ${BASE}`);

  const landing = await fetch(`${BASE}/`, { redirect: "follow", headers: { "cache-control": "no-cache" } });
  const html = await landing.text();
  console.log(`[smoke] landing ${landing.status}  ${cacheLine(landing)}`);
  if (landing.status !== 200) problems.push(`landing answered ${landing.status}`);

  // Every finished-deal link the page actually offers, in whichever shape it
  // offers them. Not a hardcoded list and not one shape: the point is to follow
  // what a visitor would click. `/deals/finished/<scenario>` is the current
  // shape, which redirects; `/deals/<uuid>` is the old one, which is itself a
  // finding (see the href check below) but must still be followed, or this
  // script would report "no links" on exactly the deploy it exists to catch.
  const links = [...new Set([...html.matchAll(/href="(\/deals\/(?:finished\/[a-z0-9-]+|[0-9a-f-]{36})[^"]*)"/g)].map((m) => m[1]))];
  console.log(`[smoke] finished-deal links on the page: ${links.length}`);
  if (links.length === 0) {
    problems.push("the landing page offers no finished-deal links at all, so a judge has nothing to open");
  }

  for (const href of links) {
    const res = await fetch(`${BASE}${href}`, { redirect: "follow" });
    const ok = res.status === 200;
    const landed = res.url && res.url !== `${BASE}${href}` ? `  -> ${res.url.replace(BASE, "")}` : "";
    console.log(`[smoke]   ${href}  ${res.status}${landed}${ok ? "" : "  <-- a link on the landing page is dead"}`);
    if (!ok) problems.push(`the landing link ${href} answered ${res.status}; the page is offering a deal a judge cannot open`);
    // A redirect that lands on the "not here right now" page is not a dead link,
    // but it is not a finished deal either, and a judge clicking it sees neither.
    if (ok && /\/deals\/finished\/unavailable/.test(res.url ?? "")) {
      problems.push(`the landing link ${href} resolved to the unavailable page, so no finished deal exists for that scenario`);
    }
  }

  for (const phrase of WITHDRAWN) {
    if (html.includes(phrase)) problems.push(`the landing page still says "${phrase}", which this repo withdrew`);
  }

  // The property the stable-route fix actually bought, and the one the 200 check
  // cannot see. A landing page that prints a deal id into an href is one re-seed
  // away from being a dead link in every cache, tab, bookmark and video frame
  // that holds it, and it will still answer 200 on the day it is written. This
  // is what caught Matt out on 2026-10-11.
  const idHrefs = [...new Set([...html.matchAll(/href="(\/deals\/[0-9a-f-]{36}[^"]*)"/g)].map((m) => m[1]))];
  if (idHrefs.length > 0) {
    problems.push(
      `${idHrefs.length} landing link${idHrefs.length === 1 ? "" : "s"} carry a deal id instead of a scenario, so a cached copy of this page goes dead at the next re-seed: ${idHrefs.join(", ")}`,
    );
  }

  // Stale HTML is the failure this script was written for, so say what was seen.
  const age = Number(landing.headers.get("age") ?? "0");
  const cache = landing.headers.get("x-vercel-cache") ?? "unknown";
  if (age > 0 || /HIT|STALE/i.test(cache)) {
    notes.push(`the landing page came from a cache (${cacheLine(landing)}). It can be correct and still be a cached copy; re-run to see whether a fresh render agrees.`);
  }

  for (const n of notes) console.log(`[smoke] note: ${n}`);

  if (problems.length === 0) {
    console.log(`[smoke] ${links.length} finished-deal link${links.length === 1 ? "" : "s"} answered 200, none carries a deal id, and no withdrawn copy is on the page.`);
    process.exit(0);
  }

  console.error(`\n[smoke] ${problems.length} problem${problems.length === 1 ? "" : "s"}:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

main().catch((error) => {
  console.error(`[smoke] could not complete: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
