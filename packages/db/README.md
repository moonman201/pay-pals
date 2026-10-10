# @pay-pals/db

Two implementations of the `DealStore` contract plus webhook receipts
(`PayPalsStore` from `@pay-pals/contracts`):

- `createMemoryDealStore()`: in memory, no database. Demo mode and tests.
- `createPostgresDealStore(databaseUrl)`: Drizzle on Postgres (Neon in
  production). Call `.migrate()` once, or run `npm run migrate -w packages/db`.

Both enforce the deal transition table from contracts, append a
`state_changed` event on every transition, require card versions in order
and refuse to change a locked card. Dollars in contracts, integer cents in
the database.

## Clock and replay

Both factories take `{ clock?: () => Date }`. Every timestamp the store
generates comes from it: event `at`, `createdAt` and `updatedAt`,
`lockedAt`, agreement times, `sellerJoinedAt`. The default is the wall
clock. To seed a timeline with fixture dates:

```ts
import { createMemoryDealStore, createPostgresDealStore, createReplayClock } from "@pay-pals/db";

const replay = createReplayClock("2026-10-21T16:00:00.000Z");
const store = createPostgresDealStore(process.env.DATABASE_URL!, { clock: replay.clock });
replay.set("2026-10-21T16:01:00.000Z");
await store.transition(dealId, "LISTED", "system", "Listed.");
```

The hash chain is read back in `(at, id)` order, so within one deal the
clock must only move forward. An append that would land before the deal's
latest event is refused with `EventOutOfOrderError`; equal times are fine.

## Schema and migrations

`schema.ts` is owned by the Lead. Migrations live in `drizzle/` (the source
of truth) and are generated with `npm run db:generate -w packages/db` after
a schema change. That command also renders the folder into
`src/postgres/migrations.generated.ts`, which is what `migrate()` runs from.
The migrator reads nothing from disk, so it works inside a Next.js server
bundle where the `drizzle/` folder is not deployed. A test fails when the
generated module is stale; `npm run db:bundle -w packages/db` refreshes it.

## Removing seeded demo deals

Before a redeploy re-seeds the demo, clear the old seeds:

```
npm run db:delete-seeded-demo-deals -w packages/db -- --keep-seed 2026-10-08.1        # lists what would go
npm run db:delete-seeded-demo-deals -w packages/db -- --keep-seed 2026-10-08.1 --yes  # deletes
```

What selects a deal is our seed stamp: the `data.seedVersion` the seeder
writes on the `deal_created` event. A stamped deal is ours to delete, an
unstamped one is not, so a judge's own run through the demo always stays.
Two more conditions ride along as a safety net, so a stamp alone is not
enough: the deal must have a scenario set and must be in COMPLETE, BLOCKED
or ISSUE. A stamped deal still in flight is never touched. Seeds stamped
with the `--keep-seed` version are kept, so the current seeds stay and only
stale ones go.

The stamp replaced an earlier rule that read the payment (`paypal_order_id`
starting with `FIXTURE-`, or no payment and no locked card). That rule
stopped matching our own seeds as soon as a re-seed gave them real sandbox
order ids, which left them undeletable. Each candidate still reports its
payment as `fixture order`, `real order` or `none`, but the payment no
longer decides anything.

Children are removed by the schema's cascades. `--explain <dealId>` prints
every factor for one deal. The same logic is exported as
`deleteSeededDemoDeals(db, { dryRun, keepSeedVersion })`.

## Tests

`npm test -w packages/db` runs one conformance suite three ways:

| Target | When it runs |
|---|---|
| memory store | always |
| Postgres repositories on PGlite (in-process Postgres, real migration) | always, no server needed |
| Postgres repositories on a hosted database | only when `TEST_DATABASE_URL` is set |

`TEST_DATABASE_URL` must point at a database set aside for tests, for example
a Neon branch. The suite applies migrations and writes rows and does not
clean up. It deliberately does not read `DATABASE_URL`, so `npm test` can
never write into the app's database.
