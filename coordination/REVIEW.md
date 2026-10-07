# REVIEW.md

Findings from qa, reality-check and the Lead, tagged by module. Format: `[date] [module] finding. Repro. Owner.`
[2026-10-07] [apps/web] Six production files import from lib/mocks (fixtureById in flows/start.ts, flows/evidence.ts, snapshot.ts; nowIso in flows/pay.ts, flows/ship.ts, flows/shared.ts), so services.ts is not the only seam and the demo path would still depend on mocks after the real packages land. Repro: `git ls-files apps/web | xargs grep -nE "from ['\"][^'\"]*mocks" | grep -v "^apps/web/lib/mocks/"`. Owner: builder-web. Fix: fixtures are a contract artifact, move the lookup to lib/scenarios.ts; move nowIso to lib/time.ts.
[2026-10-07] [apps/web] No GET route for the evidence pack; only POST /api/deals/[id]/evidence. qa and the evidence page both want a read. Owner: builder-web.
[2026-10-07] [packages/db] CLOSED 2026-10-07: 47 tests on main after merge 61c7ca0.
[2026-10-07] [packages/paypal] `SKIP_REAL_TESTS` is not honored; `npm test` hits the sandbox whenever .env.local has credentials. Repro: `grep -rn SKIP_REAL packages/paypal` returns nothing while sandbox.test.ts runs. Owner: builder-paypal.
[2026-10-07] [packages/paypal] Dispute handler hard-codes `state === "DELIVERED"` instead of canTransition; after contracts v1.2.0 a dispute on a PAID or SHIPPED deal should move it to ISSUE. Owner: builder-paypal.
[2026-10-07] [packages/paypal] Gate script does not print the deal id it used, so custom_id cannot be checked from outside. Each personal run also leaves one APPROVED uncaptured order in the sandbox from the failed card attempt. Owner: builder-paypal.
