/**
 * The rules behind `npm run smoke:prod -w apps/web`: what to fetch, what each
 * page must say, and what counts as a failure. Pure, so it can be tested; the
 * script next to it does the fetching and the printing.
 *
 * The strings are ones the finished demo deals render today, taken from the
 * rules the pals apply (the red-flag and shipment checks), not from model prose,
 * so a re-seed with real model calls does not change them. If a deal's copy
 * changes on purpose, change the table here in the same commit.
 */

export const SCENARIOS = ["fake-slab", "clean-ps5", "empty-box"];
export const ROLES = ["buyer", "seller"];

/** Seconds a page may take. The cold start that took 119 s is what this guards. */
export const SLOW_MS = 10_000;

/** Strings that must appear on a scenario's room page, for both roles, and on its evidence page where it has one. */
export const EXPECTED = {
  "fake-slab": { room: ["Blocked", "exact match to a listing photo already on file"], evidence: [] },
  "clean-ps5": { room: ["Complete"], evidence: [] },
  "empty-box": { room: ["Issue open", "packing photo"], evidence: ['data-testid="pack-issue-reason"'] },
};

export function parseArgs(argv, env = {}) {
  let base = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base") {
      i += 1;
      base = argv[i] ?? null;
    } else if (arg.startsWith("--base=")) {
      base = arg.slice("--base=".length);
    } else {
      return { ok: false, message: `Unknown argument "${arg}". Usage: npm run smoke:prod -w apps/web -- --base <url>` };
    }
  }
  base = base ?? env.SMOKE_BASE_URL ?? env.NEXT_PUBLIC_APP_URL ?? null;
  if (!base || !/^https?:\/\/[^/\s]+/i.test(base)) return { ok: false, message: "Pass --base <url>, such as https://pay-pals-m00n1.vercel.app" };
  return { ok: true, base: base.replace(/\/+$/, "") };
}

/** The "See the finished deal" links on the landing HTML, by scenario. A scenario with no link is left out. */
export function findFinishedLinks(html) {
  const out = {};
  for (const m of html.matchAll(/href="(\/deals\/finished\/([a-z0-9-]+)[^"]*)"/g)) {
    const scenario = m[2];
    if (SCENARIOS.includes(scenario) && !out[scenario]) out[scenario] = m[1].replace(/&amp;/g, "&");
  }
  return out;
}

/** The same link as the other side. Links carry ?as=<role>; a link without it gets one. */
export function asRole(href, role) {
  const url = new URL(href, "http://x");
  url.searchParams.set("as", role);
  return `${url.pathname}${url.search}`;
}

/** The evidence page link a room offers, if any, as the same role. */
export function findEvidenceLink(roomHtml) {
  const m = roomHtml.match(/href="(\/deals\/[0-9a-f-]{36}\/evidence[^"]*)"/);
  return m ? m[1].replace(/&amp;/g, "&") : null;
}

/** Problems with one fetched page. `result` is { path, status, ms, body, finalPath }. */
export function checkPage(result, expected) {
  const problems = [];
  if (result.status !== 200) problems.push(`${result.path} answered ${result.status}`);
  if (result.ms > SLOW_MS) problems.push(`${result.path} took ${(result.ms / 1000).toFixed(1)} s, over the ${SLOW_MS / 1000} s limit`);
  if (/\/deals\/finished\/unavailable/.test(result.finalPath ?? "")) problems.push(`${result.path} led to the "example not ready" page, so that deal is not seeded`);
  else if (result.status === 200) {
    for (const text of expected) {
      if (!result.body.includes(text)) problems.push(`${result.path} is missing "${text}"`);
    }
  }
  return problems;
}
