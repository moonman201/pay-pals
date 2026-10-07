# Changelog

## Unreleased

### 2026-10-06
- Monorepo scaffold: npm workspaces, TypeScript, Vitest, root build and test scripts.
- `packages/contracts` v1.0.0-draft: deal state table, item card, red flags, verdicts, messages and timeline, shipping, payment, evidence pack, agent and PayPal and store interfaces, three scenario fixtures. 24 tests.
- `packages/db/schema.ts`: Drizzle schema for deals, item cards, messages, verdicts, payments, shipments, evidence packs, deal events and webhook receipts.
- ADR 0001: monorepo layout and contracts first.

### 2026-10-07
- `packages/agents`: red-flag rule engine, Buyer Pal review and arrival check, Seller Pal card builder and shipment checklist, Channel3 and fixture price lookups with disk cache, evidence pack builder. 64 tests.
