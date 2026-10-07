# ADR 0001: npm workspaces monorepo, contracts first, source-level package exports

Date: 2026-10-06. Status: accepted.

## Context
Pay Pals is built by one Lead session delegating to lane subagents working in parallel git worktrees. Lanes must be able to build and test on day one without waiting on each other, and a judge must be able to clone the repo and run it with few steps.

## Decision
1. **npm workspaces**, `packages/*` and `apps/*`. Node 22 (`.nvmrc`), TypeScript 5, Vitest 3. Root `npm test` and `npm run build` fan out to every workspace.
2. **`packages/contracts` is the only dependency shared between lanes.** It holds types, Zod schemas, the deal transition table, the agent, PayPal and store interfaces, and the three scenario fixtures. It has no runtime dependency other than Zod.
3. **Workspace packages export TypeScript source**, not a built `dist`. `exports` points at `src/index.ts`. Vitest and Next.js (`transpilePackages`) consume source directly, so a lane never has to rebuild another lane's package to see its changes. `npm run build` still runs `tsc` as a typecheck and declaration gate.
4. **Zod schemas next to each type.** API routes in `apps/web` validate request bodies with them, and the fixture tests parse every fixture through them so a fixture can never drift from the contract.
5. **Money is a number in dollars in contracts and integer cents in the database.** The repository layer converts. `toPaypalAmount` formats for PayPal.
6. **Schema lives in `packages/db/schema.ts`, owned by the Lead.** builder-paypal implements repositories against it and may add indexes and migrations, but not change columns after the freeze on Fri Oct 9.

## Consequences
- Contract changes go through the Lead with a `blast-radius` run, a WORKLOG post and a version bump in `packages/contracts/package.json`.
- Every lane's tests can use `ALL_FIXTURES` from `@pay-pals/contracts` without a database, a PayPal token or an Anthropic key.
- Fixture photo URLs point at `/fixtures/<scenario>/<file>` under `apps/web/public`. The image files themselves are not in the repo yet. They must be our own photographs or renders, never copied from another company.
