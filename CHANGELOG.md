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
- Demo item is now a PlayStation 5 with its original box (contracts v1.4.0-draft): scenarios scam-ps5, clean-ps5, empty-box. Seller Pal reads console and box serials and says whether they match; a box label never counts as the item serial; an empty box yields a serial mismatch and an evidence pack. Migration 0002 maps old scenario ids.
- Buyer Pal price range for a used item is derived from new retail scaled by condition, with cheaper used offers pulling it down; the pal says so.
- Env loader reads the app and root .env.local files; idempotent finished-deal seed on Postgres; a second wallet button reuses the open order; the sandbox seller account is the demo payee when configured.
- Real-mode Playwright spec (`npm run test:e2e:real`) completes a sandbox payment through the PayPal SDK buttons headless.
- Buyer-first deals (contracts v1.5.0-draft): "Use Pay Pals Protection" entry with the seller's PayPal email and listing link, seller invite link and join page, INVITED state, refusal recorded and flagged as INVITE_REFUSED (non-overridable). Seller-started stays as the secondary path.
- Graded items: cert number and grade on the card, PSA cert lookup (cached), CERT_MISMATCH stop flag, cert result on the card and in the verdict. New fake-slab demo scenario; two demo items.
- Tamper-evident history: every deal event hash-chained in both stores under a lock; the chain head rides on the PayPal order as custom_id (`dealId#hash`) and the payment record; the evidence pack verifies the stored events against it. Migration 0003 with an in-code hash backfill.
- Fix: the Postgres store now keeps the box serial (column was missing).
- Live site review (Oct 7): pals read real images with absolute photo URLs and say what they looked at; captions describe only what is visible; reused-photo flag from a perceptual-hash match against a reference set; Channel3 relevance filter, dedupe, same-model preference, no range from thin data, no used-from-new discount on graded cards; one payment flag per review; per-channel message counts; seeded demo timelines replay fixture dates anchored three days in the past; live hash badge on the deal page and evidence pack; name punctuation, cert wording, flag badge layout; guard tests and a desktop and phone screenshot pass.
- Judge walk (Oct 8): an unchecked cert is never a mismatch and the pal never claims a PSA lookup it did not make; no photo claims when no image was read; "No reliable market price found" instead of a zero range; agree only in REVIEWED; seeded example deals labelled, with example ids and no claim that PayPal holds the hash; seed versioning and a delete-seeded-demo-deals script; PayPal descriptions trimmed at a word; honest invite event; fresh review after a card change in the clean fixture.
- Contracts v1.6.0, frozen Oct 8: scenario 3 ship-time check. The Buyer Pal always asks a used device's seller for the system screen; `checkShipment` raises MISSING_PACKING_PHOTO at ship time; the evidence pack lists the questions the seller never answered and the ship-time flags; an agreement notice does not count as an answer. Shipment flags persisted (migration 0004, hash column now NOT NULL). Demo deals on the sandbox gateway show the PayPal sandbox test buyer on the pay panel; "I approved in PayPal, capture now" button. Seed version 2026-10-08.2.
- Visual pass: the two Pals carry the product. Hero above the fold, Pal avatars wherever a pal speaks, one colour token file with measured contrast in light and dark, a seven step progress stepper, the verdict as the loudest block on a review, a receipt-style locked card, side by side cert and arrival comparisons, a seal for the history check, scenario outcome visuals, short motion that respects reduced motion, and phone-first spacing with 44 px targets. Judge-read fixes: no claim of a check that did not run, no zero price ranges, no retailer names in the price panel, a staged waiting line, evidence page chrome, dark mode contrast, and a seller join page with its Pal. Demo-only mode now pins the payee, and the e2e server pins its environment and the seeded state, so the suite answers the same with or without keys.
