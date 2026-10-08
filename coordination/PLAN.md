# PLAN.md: Pay Pals v1

Owner: the Lead (the one Claude Code session Matt runs; see CLAUDE.md). Draft written 2026-10-06. The Lead refines it while writing contracts and keeps the status table current.

## Stack (decided, do not relitigate)
- **TypeScript monorepo, npm workspaces.** Node 20+.
- **apps/web:** Next.js (App Router). UI plus API routes. Mobile-friendly.
- **Database:** Neon Postgres + Drizzle ORM (same as Zirkl).
- **AI:** Claude API (Anthropic SDK) with tool use for both pals. Model name from env.
- **Market prices:** Channel3 API (sponsor; 20,000 free credits, promo code PAYPAL-HACKATHON-2026).
- **PayPal:** Orders v2 REST called directly (create with payee, capture), JS SDK v6 for the PayPal and Venmo buttons, Webhooks. PayPal AI Toolkit plugin and APIMatic Context Plugin loaded in Claude Code for docs and sandbox access while building.
- **Hosting:** Vercel (Matt's usual) with a Neon production branch. Render ($50 sponsor credits) is the fallback.
- **Tests:** Vitest for units and integration, Playwright for e2e.

## Module map
```
packages/contracts   types, deal state machine, agent + PayPal interfaces, fixtures   (Lead)
packages/agents      Seller Pal, Buyer Pal, red-flag rules, Channel3 client, evidence pack   (builder-agents)
packages/paypal      OAuth token, create/capture order, webhook verify                 (builder-paypal)
packages/db          Drizzle schema (Lead defines), repositories, migrations      (builder-paypal)
apps/web             pages, deal room UI, API routes wiring the modules together       (builder-web)
tests/integration    cross-module tests against the contracts                          (qa)
tests/e2e            Playwright runs of the three demo scenarios                       (qa)
```
Modules talk only through `packages/contracts` interfaces. apps/web is the only place modules are wired together.

## Contracts (v1.5.0-draft on main in `packages/contracts`, frozen Fri Oct 9)

The TypeScript in `packages/contracts/src` is the contract. This section is the summary. Where they differ, the code wins and the Lead fixes this file.

### Deal states
`DRAFT -> LISTED -> REVIEWED -> AGREED -> PAYMENT_PENDING -> PAID -> SHIPPED -> DELIVERED -> COMPLETE`
`INVITED` sits between DRAFT and LISTED for buyer-started deals (INVITED -> LISTED when the seller uploads, INVITED -> REVIEWED when the buyer has the pal review a refusal with no card). Side exits: `BLOCKED` (Buyer Pal hard stop, from REVIEWED), `ISSUE` (from PAID, SHIPPED or DELIVERED: item never arrived, wrong item, or a PayPal dispute; evidence pack built), `CANCELLED` (either party, before PAID).
Rule: the item card can change until AGREED. Both sides agree to a card version (`Deal.buyerAgreedAt`, `Deal.sellerAgreedAt`); a new version clears both; when the second agreement lands the card locks and the deal moves to AGREED. The locked card becomes the PayPal order description. Any change after that requires a new deal.

### ItemCard (versioned)
title, brand, model, serial (nullable), conditionGrade (new | like_new | good | fair | for_parts), conditionNotes, included[], photos[] (url + whatItShows), askingPrice, currency (USD), sellerPaypalEmail, version, lockedAt (nullable).

### RedFlag
code: `FRIENDS_AND_FAMILY_REQUEST | OFF_PLATFORM_PAYMENT | PRICE_FAR_BELOW_MARKET | URGENCY_PRESSURE | NAME_MISMATCH | STOCK_OR_REUSED_PHOTO | MISSING_SERIAL | SHIP_BEFORE_PAY_TRICK | OTHER`
severity: `info | caution | stop`. evidence (quote or field), explanation (one plain sentence).

### Agent interfaces (packages/agents)
- `SellerPal.buildCard({ dealId, listingText, photos, sellerNotes, sellerPaypalEmail, askingPrice? }) -> ItemCard` (draft)
- `SellerPal.applyRequest(card, buyerRequest, sellerReply, newPhotos?) -> ItemCard` (new version)
- `SellerPal.shipmentChecklist(deal) -> ChecklistItem[]`
- `BuyerPal.review(card, chatTranscript, context?: { seller }) -> Verdict { overall: go | caution | stop, flags: RedFlag[], priceCheck: { marketLow, marketHigh, sources[] }, questionsForSeller[] }`
- `BuyerPal.checkArrival(lockedCard, arrivalPhotos) -> ArrivalCheck { matches: boolean, mismatches[] }`
- `buildEvidencePack(EvidenceInput) -> EvidencePack` (deal, locked card, verdicts, arrival check, chat, payment, shipment, arrival photos, timeline, plain summary)
Each returns typed data plus a short `pal message` string for the UI. Deterministic rules run before the model; the model never removes a `stop` flag that a rule raised.

### PayPal interface (packages/paypal)
- `createDealOrder(lockedCard, dealId) -> { orderId, status }` with `purchase_units[0].payee.email_address = sellerPaypalEmail`, one line item carrying title, serial and condition in name/description (respect PayPal field limits), `custom_id = dealId`.
- `captureOrder(orderId) -> { captureId, status }`
- `verifyWebhook(headers, body) -> boolean`
- Events handled: `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `CUSTOMER.DISPUTE.CREATED`.
- Tracking is stored in our DB. Pushing tracking into PayPal is a stretch goal (only the payee's own credentials can do it).

## Lane assignments
Each lane is a Claude Code subagent in `.claude/agents/`. The Lead launches independent lanes in parallel, each in its own worktree, and merges their branches. Matt does not open extra windows.

### Lane 0 (gate), run by builder-paypal, first thing Wed Oct 7
In sandbox: create an order with payee = a sandbox **personal** account, pay it as a sandbox buyer, confirm the money lands. Also confirm with payee = a sandbox business account.
- **Pass:** post to WORKLOG and continue.
- **Fail on personal:** STOP. Post to BLOCKERS for Matt. Options: (a) v1 sellers must have a business account (free to open), (b) ask PayPal in the hackathon Discord, (c) both. Recommendation: (c), and keep building against business-account payees meanwhile.
Save every working call as a Postman collection in `docs/postman/`.

### Lead: `packages/contracts`, `packages/db/schema.ts`, `coordination/`, `docs/adr/`
- Must not write feature code.
- Owes: contracts and schema above as real TypeScript, plus fixtures for all three demo scenarios (`scam-ps5`, `clean-ps5`, `empty-box`) so every lane can build against mocks on day one.
- Done: `npm run build` passes on contracts; fixtures load. **Lands first, by Fri Oct 9.** Lead also owns merging, deploy (Vercel + Neon), CHANGELOG.md and `docs/SUBMISSION.md`.

### builder-agents: `packages/agents`
- Must not touch PayPal, the database or UI.
- Depends on: contracts. Owes: the agent interfaces above.
- Builds: Claude tool-use loops for both pals; rule engine for red flags; Channel3 client with caching (save credits); vision reads of serials from photos; evidence pack builder.
- Done: unit tests where the scam fixture yields `FRIENDS_AND_FAMILY_REQUEST`, `PRICE_FAR_BELOW_MARKET` and `URGENCY_PRESSURE` with overall `stop`; the clean fixture yields `go` or `caution` with no `stop` and a card whose console serial matches the box serial; the empty-box fixture yields `matches: false` with the missing console serial named.
- Lands any time after contracts. No dependency on builder-paypal or builder-web.

### builder-paypal: `packages/paypal`, `packages/db` (repositories and migrations, not schema design)
- Must not touch agents or UI.
- Depends on: contracts, schema. Owes: the PayPal interface and repositories (`deals`, `itemCards`, `messages`, `verdicts`, `payments`, `shipments`, `evidence`) plus the deal state machine enforcing legal transitions.
- Done: integration test creates and captures a real sandbox order to the seller payee with the card text visible on the order; webhook handler verified with a sandbox event; illegal state transitions rejected in tests.
- Starts with Lane 0.

### builder-web: `apps/web`
- Must not put business logic in the UI. Calls modules only through their interfaces.
- Depends on: contracts (mocks first, real modules as they land). Owes: the product a judge clicks through.
- Builds: seller "start a deal" flow; the deal link page with buyer view (blue) and seller view (gold) matching the hero image; item card; each pal's chat pane plus a shared timeline; PayPal and Venmo buttons (JS SDK v6); shipping step; arrival check; evidence pack page; a "demo mode" landing that lets a judge pick one of the three scenarios and play either side.
- Done: all three scenarios clickable end to end on mocks by Sat Oct 17, on real modules by Fri Oct 23.

### qa: `tests/integration`, `tests/e2e`
- Writes tests against contracts during Phase 3, not after.
- Done: Playwright runs all three scenarios against the sandbox, green on the integration branch. Files findings in REVIEW.md with repro steps.

### Matt
- Credentials into `.env.local` (see `.env.example`): PayPal sandbox app, sandbox accounts (buyer personal, seller personal, seller business), Anthropic key, Channel3 key, Neon URL.
- Ask in the hackathon Discord whether a personal account can be the payee on a checkout order.
- Product calls (see Open decisions). Video, Devpost write-up, Devpost elevator pitch.

## Schedule
| Dates | Phase | Gate |
|---|---|---|
| Wed Oct 7 to Fri Oct 9 | Contracts + Lane 0 | Lane 0 result. Contracts, schema and fixtures frozen Fri Oct 9. |
| Sat Oct 10 to Fri Oct 23 | 3 Execute | Sat Oct 17: scenario 2 end to end on mocks. Fri Oct 23: all three on real sandbox, and the three finished demo deals re-seeded with real sandbox order and capture ids (no FIXTURE-ORDER ids on the live site after that date). |
| Sat Oct 24 to Sun Nov 1 | 4 Review | REVIEW.md empty, e2e green, deployed. **Feature freeze Sun Nov 1.** |
| Mon Nov 2 to Sun Nov 8 | 5 Submit prep | Video recorded and edited. Devpost draft. |
| Mon Nov 9 to Wed Nov 11 | Buffer | Fixes only. **Submit Wed Nov 11.** Deadline Thu Nov 12, 3:00 PM Eastern. |

## Prize targets
- Grand Prize, or the Best Agentic Commerce honorable mention.
- One sponsor prize only (rules allow one): **Channel3**. The Buyer Pal's price check must call the Channel3 API for real.

## Decisions (Matt, Oct 6)
1. **Overrides.** A buyer can override `caution` flags. A buyer can never override a payment-method flag (`FRIENDS_AND_FAMILY_REQUEST`, `OFF_PLATFORM_PAYMENT`). Pay Pals only ever creates a Goods and Services checkout payment, so those flags end the deal. Encoded as `PAYMENT_METHOD_FLAGS` in `packages/contracts/src/red-flag.ts`.
2. **Who starts a deal.** Either side. The seller usually does; a buyer can paste a listing and invite the seller.
3. **Accounts.** None in v1. A deal link plus the party's email is enough.
4. **Brand names.** Real brand and product names are fine in demo data, UI and video. No copied logos or artwork.
5. **Two-sided agreement (Oct 7).** Both the buyer and the seller agree to a specific card version. The card locks and the deal moves to AGREED when the second agreement lands. A new card version clears both. Shipped Oct 7 as contracts v1.3.0-draft (3b71ad6).
7. **Buyer starts the deal (Oct 7).** Entry point is a payment screen: "Use Pay Pals Protection," seller PayPal email, listing link. Seller gets an invite link to join and upload photos. State `INVITED` between DRAFT and LISTED. A refusal ("Friends & Family only") is `INVITE_REFUSED`, a payment-method flag, non-overridable. Seller-started stays, secondary. Email delivery of the invite is a stretch; v1 shows a link to send.
8. **Two demo items (Oct 7).** PS5 (clean deal, empty box) and a PSA-graded Pokemon slab (fake slab). Buyer Pal checks graded items against PSA's cert API; a mismatch is `CERT_MISMATCH`, stop.
9. **Tamper-evident history (Oct 7).** Every DealEvent carries prevHash and hash (contracts history.ts). The chain head at order creation goes into the PayPal order custom_id (`dealId#hash`) and the payment record. The evidence pack verifies the stored events against it.
10. **Scenario 3 ship-time check (Oct 7, Matt).** The seller never answers the Buyer Pal's questions and the buyer pays anyway; when the seller ships without the required packing photo the Buyer Pal raises a caution at ship time and the evidence pack calls out the unanswered questions and the missing photo. Proposed contract additions (jsonb only, no migration): flag code `MISSING_PACKING_PHOTO`, `Shipment.flags?: RedFlag[]`, `EvidencePack.unansweredQuestions?: string[]` and `shipmentFlags?: RedFlag[]`. Waiting on Matt before Friday.
6. **Non-payment stops (Oct 7).** A stop that is not about payment method (price far below market, ship-before-pay) stays overridable with the acknowledgment checkbox and stronger warning wording. Only payment-method flags end the deal.

## Live site review, Oct 7 (Matt). Lane assignments
Branch `review-oct7`, merged to main 718be0b on Oct 8 and deployed. Each fix is its own commit with tests. Items 1 to 15 done (item 1 and the reused-photo check light up fully once photo files exist; item 4 needs a comp key, see BLOCKERS). Item 16 running against production. Stop rules: a contract or schema change, or a product change, goes to Matt first; everything else keeps moving.

**Product decision (Matt).** Scenario 3 stays: the Buyer Pal asks for proof, the seller never answers, the buyer pays anyway. Added: when the seller ships without the required packing photo, the Buyer Pal raises a caution at ship time, and the evidence pack calls out both the unanswered questions and the missing photo. Needs a new flag code and two optional fields; surfaced to Matt before the Friday freeze (see Decisions).

| # | Lane | Fix |
|---|---|---|
| 1 | builder-agents (+ builder-web for URLs) | Vision is not running on the live site: both PS5 arrival checks fall back to the captions. Find the cause (relative `/fixtures/...` URLs are not fetchable from the server, missing files, fetch refused), fix it so the pals read real images when they exist, and make sure the sentence "I could not open the photo files" never appears in output. apps/web passes absolute photo URLs. |
| 2 | Lead (fixtures) + builder-agents | Captions describe only what is visible. The Lead rewrote every fixture caption. The reused-photo flag must come from an image check, not caption words; the empty-box finding must come from the pal looking at the arrival photo. |
| 3 | builder-agents | Channel3 relevance: drop listings that are not the same item, never apply the used-from-new discount to graded cards, show "No reliable market price found" when nothing relevant comes back, never build a range from one listing. |
| 4 | builder-agents | Scenario 1 must flag the price as far below market for a PSA 10 Base Set Charizard from a real comp source, not a guess. Report which source works; a new key is a Matt item. |
| 5 | builder-agents | PS5 comps: dedupe repeated listings, drop bundles, prefer the same model (CFI-1215A) over Slim. |
| 6 | builder-agents | Scenario 1: the three overlapping payment flags (Friends and Family, off platform, refused protection) collapse into one flag that quotes the seller once. Cert mismatch, pressure and reused photo stay separate. |
| 7 | builder-paypal (stores) + builder-web (seeder) | Seeded timeline events all carry the seed time while payment and shipment carry fixture dates. Stores take an injectable clock; the seeder replays with each event's fixture time so timeline, payment and shipment agree and run in order. |
| 8 | Lead | Oct 23 milestone: re-seed the three finished demo deals with real sandbox order and capture ids; no FIXTURE-ORDER ids on the live site after that date. |
| 9 | builder-agents (summary) + builder-web (page) | Evidence pack says "6 chat messages" where the page shows 4: count per channel and label it ("4 shared chat messages, 2 pal messages"). |
| 10 | builder-web | Hash chain badge on the deal page and the evidence pack: "History unchanged since PayPal order" when the stored chain verifies against the hash on the order, a clear warning when it does not, computed live on render. Raw hashes stay secondary. |
| 11 | builder-web | "You are the buyer, Dana M.." double period. Name punctuation. |
| 12 | builder-web | Cert comparison reads "PSA 10, PSA 10": remove the duplicate. |
| 13 | builder-web | Flag badges (severity, category, "no override") render as separate elements, not run-together text. |
| 14 | qa | Tests that fail if: the "could not open the photo files" string appears in any pal output; a price range has min equal to max; any seeded timeline is out of order or contradicts payment or shipment dates; the hash badge shows verified when the chain was edited. |
| 15 | qa | Playwright pass on the three finished deals and their evidence pages, desktop and phone width, with screenshots, flagging layout breaks. |
| 16 | reality-check | After merge, walk all three scenarios on the Vercel URL as a skeptical judge and report anything that looks pre-written rather than produced by the agents. |

## Status (Lead keeps this current)
| Lane | Status | Last merge |
|---|---|---|
| Lead: contracts, schema, fixtures | v1.5.0-draft on main (e221bf2): buyer-first deals, PSA cert check, hash-chained history, two demo items. Freeze Fri Oct 9. | 2026-10-07 |
| Lane 0 gate (builder-paypal) | PASS personal and PASS business, sandbox, 2026-10-07. Personal payee cannot take direct card funding; wallet flow works. | |
| builder-agents | merged 9e83667 plus follow-ups (v1.1.0 fields, model stop cap, grounded model flags, battery-health ask). 80 tests, reality-check holds; real Claude runs: scam stop, clean go. Real Claude tests ran 3/3; Channel3 live schema unverified until a key lands. | 2026-10-07 |
| builder-paypal | merged 61c7ca0, follow-up merged (v1.2.0 types, raw bodies, dispute via table, skip flag, gate prints deal id). 83 tests, reality-check holds. | 2026-10-07 |
| builder-web | merged 77114c6: real agents, db and paypal behind lib/services.ts, demo mode with no keys, webhook route, PAY_PALS_DEMO_ONLY switch. Reality-check holds incl. a real sandbox order. Milestone "all three on real modules" (due Oct 23) met Oct 7 except the SDK buttons (no public client id yet) and Postgres (no DATABASE_URL yet). | 2026-10-07 |
| qa | merged 3b71ad6: 30 integration tests; Playwright for all three scenarios, re-agree path and phone width, 6 specs green. Fixture milestone (due Oct 17) met Oct 7. | 2026-10-07 |
