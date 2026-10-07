# Changelog

## Unreleased

### 2026-10-06
- Monorepo scaffold: npm workspaces, TypeScript, Vitest, root build and test scripts.
- `packages/contracts` v1.0.0-draft: deal state table, item card, red flags, verdicts, messages and timeline, shipping, payment, evidence pack, agent and PayPal and store interfaces, three scenario fixtures. 24 tests.
- `packages/db/schema.ts`: Drizzle schema for deals, item cards, messages, verdicts, payments, shipments, evidence packs, deal events and webhook receipts.
- ADR 0001: monorepo layout and contracts first.

### 2026-10-07
- `packages/agents`: red-flag rule engine, Buyer Pal review and arrival check, Seller Pal card builder and shipment checklist, Channel3 and fixture price lookups with disk cache, evidence pack builder. 64 tests.
- `packages/paypal`: sandbox-only gateway (OAuth with caching, create order with payee, capture, webhook verify), idempotent webhook handler, Lane 0 gate script with headless buyer approval, Postman collection. 35 tests.
- `packages/db`: in-memory and Postgres deal stores sharing one conformance suite (memory and PGlite), state machine on the contract table, initial migration. 47 tests.
- Contracts v1.2.0-draft: ISSUE reachable from PAID and SHIPPED, webhook receipt store, raw payment records, optional review context, seller price hint, arrival photos in the evidence input.
- `apps/web`: demo landing, start a deal, deal room with buyer and seller views, pal panes, shared chat and timeline, pay step (PayPal and Venmo wallet buttons, placeholder without a client id), ship, arrival check, issue step with reasons, evidence page and GET route. Fixture mocks behind one service seam. 36 tests.
