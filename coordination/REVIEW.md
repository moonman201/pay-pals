# REVIEW.md

Findings from qa, reality-check and the Lead, tagged by module. Format: `[date] [module] finding. Repro. Owner.`
[2026-10-07] [apps/web] Six production files import from lib/mocks (fixtureById in flows/start.ts, flows/evidence.ts, snapshot.ts; nowIso in flows/pay.ts, flows/ship.ts, flows/shared.ts), so services.ts is not the only seam and the demo path would still depend on mocks after the real packages land. Repro: `git ls-files apps/web | xargs grep -nE "from ['\"][^'\"]*mocks" | grep -v "^apps/web/lib/mocks/"`. Owner: builder-web. Fix: fixtures are a contract artifact, move the lookup to lib/scenarios.ts; move nowIso to lib/time.ts.
[2026-10-07] [apps/web] No GET route for the evidence pack; only POST /api/deals/[id]/evidence. qa and the evidence page both want a read. Owner: builder-web.
[2026-10-07] [packages/db] On main, `npm test -w packages/db` passes by --passWithNoTests. Closes when the builder-paypal branch merges (47 tests). Owner: Lead.
