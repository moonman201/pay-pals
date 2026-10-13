/**
 * Warms and checks the deployed site after a deploy and a seed. Read only: it
 * fetches pages and never starts a deal or presses a button.
 *
 *   npm run smoke:prod -w apps/web -- --base https://pay-pals-m00n1.vercel.app
 *
 * Loads the landing, follows each "See the finished deal" link to its room as
 * buyer and as seller, then the evidence page the room offers. Prints status
 * and time per URL and checks the strings in smoke-prod-checks.mjs. Exits 1 on
 * any non-200, any page over 10 s, a scenario with no link, or a missing
 * string. The first pass over a cold site is what warms it; a second run is
 * the timing that matters.
 */
import { asRole, checkPage, EXPECTED, findEvidenceLink, findFinishedLinks, parseArgs, ROLES, SCENARIOS } from "./smoke-prod-checks.mjs";

const parsed = parseArgs(process.argv.slice(2), process.env);
if (!parsed.ok) {
  console.error(parsed.message);
  process.exit(2);
}
const BASE = parsed.base;
const problems = [];

async function get(path) {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, { redirect: "follow", headers: { "cache-control": "no-cache" }, signal: AbortSignal.timeout(60_000) });
    const body = await res.text();
    const finalPath = res.url.startsWith(BASE) ? res.url.slice(BASE.length) : res.url;
    return { path, status: res.status, ms: Date.now() - started, body, finalPath };
  } catch (error) {
    return { path, status: 0, ms: Date.now() - started, body: "", finalPath: path, error: error instanceof Error ? error.message : String(error) };
  }
}

function show(result, extra = "") {
  const moved = result.finalPath && result.finalPath !== result.path ? `  -> ${result.finalPath.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "<id>")}` : "";
  console.log(`[smoke] ${String(result.status).padStart(3)}  ${(result.ms / 1000).toFixed(1).padStart(5)} s  ${result.path}${moved}${extra}`);
}

async function main() {
  console.log(`[smoke] ${BASE}`);
  const landing = await get("/");
  show(landing);
  problems.push(...checkPage(landing, ["Pay Pals"]));
  const links = findFinishedLinks(landing.body);

  for (const scenario of SCENARIOS) {
    const link = links[scenario];
    if (!link) {
      problems.push(`the landing offers no finished-deal link for ${scenario}; run npm run demo:seed -w apps/web`);
      console.log(`[smoke] ---  no finished-deal link for ${scenario}`);
      continue;
    }
    let evidence = null;
    for (const role of ROLES) {
      const room = await get(asRole(link, role));
      show(room, `  (${scenario}, ${role})`);
      problems.push(...checkPage(room, EXPECTED[scenario].room));
      evidence = evidence ?? findEvidenceLink(room.body);
    }
    if (evidence) {
      const page = await get(evidence);
      show(page, `  (${scenario} evidence)`);
      problems.push(...checkPage(page, EXPECTED[scenario].evidence));
    } else {
      console.log(`[smoke] ---  ${scenario} has no evidence link on its room`);
    }
  }

  if (problems.length === 0) {
    console.log("[smoke] ok");
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
