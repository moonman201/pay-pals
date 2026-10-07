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
- `apps/web` on the real packages behind one seam, webhook route, demo-only switch, issue reasons, thinking line during reviews.
- `tests/integration`: 28 cross-module tests on the memory store. `tests/e2e`: Playwright for all three scenarios and a phone-width pass, demo-only server.
- Buyer Pal: model-added flags must be grounded in the chat or card, model raises cannot create a stop on their own, three questions at most, battery-health ask for used electronics.
- `packages/db`: card writes follow the deal state; migrations bundled into a generated module.
- Two-sided agreement: both sides agree to a card version, the second agreement locks it, a card change clears both and needs a fresh review (contracts v1.3.0-draft, migration 0001, UI, e2e).
- Non-payment stops stay overridable behind a sterner warning. Payment-method flags remain a hard block.
- Channel3 client aligned with the official API reference, day-long disk cache in dev, one call per review.
