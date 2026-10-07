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

## Schema and migrations

`schema.ts` is owned by the Lead. Migrations live in `drizzle/` (the source
of truth) and are generated with `npm run db:generate -w packages/db` after
a schema change. That command also renders the folder into
`src/postgres/migrations.generated.ts`, which is what `migrate()` runs from.
The migrator reads nothing from disk, so it works inside a Next.js server
bundle where the `drizzle/` folder is not deployed. A test fails when the
generated module is stale; `npm run db:bundle -w packages/db` refreshes it.

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
