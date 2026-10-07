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

## Contracts (draft, frozen Fri Oct 9)

### Deal states
`DRAFT -> LISTED -> REVIEWED -> AGREED -> PAYMENT_PENDING -> PAID -> SHIPPED -> DELIVERED -> COMPLETE`
Side exits: `BLOCKED` (Buyer Pal hard stop, from REVIEWED), `ISSUE` (from DELIVERED, evidence pack built), `CANCELLED` (either party, before PAID).
Rule: the item card can change until AGREED. At AGREED the card version is locked and becomes the PayPal order description. Any change after that requires a new deal.

### ItemCard (versioned)
title, brand, model, serial (nullable), conditionGrade (new | like_new | good | fair | for_parts), conditionNotes, included[], photos[] (url + whatItShows), askingPrice, currency (USD), sellerPaypalEmail, version, lockedAt (nullable).

### RedFlag
code: `FRIENDS_AND_FAMILY_REQUEST | OFF_PLATFORM_PAYMENT | PRICE_FAR_BELOW_MARKET | URGENCY_PRESSURE | NAME_MISMATCH | STOCK_OR_REUSED_PHOTO | MISSING_SERIAL | SHIP_BEFORE_PAY_TRICK | OTHER`
severity: `info | caution | stop`. evidence (quote or field), explanation (one plain sentence).

### Agent interfaces (packages/agents)
- `SellerPal.buildCard(listingText, photos, sellerNotes) -> ItemCard` (draft)
- `SellerPal.applyRequest(card, buyerRequest, sellerReply, newPhotos?) -> ItemCard` (new version)
- `SellerPal.shipmentChecklist(deal) -> ChecklistItem[]`
- `BuyerPal.review(card, chatTranscript) -> Verdict { overall: go | caution | stop, flags: RedFlag[], priceCheck: { marketLow, marketHigh, sources[] }, questionsForSeller[] }`
- `BuyerPal.checkArrival(lockedCard, arrivalPhotos) -> ArrivalCheck { matches: boolean, mismatches[] }`
- `buildEvidencePack(deal) -> EvidencePack` (locked card, verdicts, chat, photos, tracking, timeline, plain summary)
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
- Owes: contracts and schema above as real TypeScript, plus fixtures for all three demo scenarios (`fixtures/scam-garmin`, `fixtures/clean-garmin`, `fixtures/wrong-item`) so every lane can build against mocks on day one.
- Done: `npm run build` passes on contracts; fixtures load. **Lands first, by Fri Oct 9.** Lead also owns merging, deploy (Vercel + Neon), CHANGELOG.md and `docs/SUBMISSION.md`.

### builder-agents: `packages/agents`
- Must not touch PayPal, the database or UI.
- Depends on: contracts. Owes: the agent interfaces above.
- Builds: Claude tool-use loops for both pals; rule engine for red flags; Channel3 client with caching (save credits); vision reads of serials from photos; evidence pack builder.
- Done: unit tests where the scam fixture yields `FRIENDS_AND_FAMILY_REQUEST`, `PRICE_FAR_BELOW_MARKET` and `URGENCY_PRESSURE` with overall `stop`; the clean fixture yields `go` or `caution` with no `stop`; the wrong-item fixture yields `matches: false` with the serial mismatch named.
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
| Sat Oct 10 to Fri Oct 23 | 3 Execute | Sat Oct 17: scenario 2 end to end on mocks. Fri Oct 23: all three on real sandbox. |
| Sat Oct 24 to Sun Nov 1 | 4 Review | REVIEW.md empty, e2e green, deployed. **Feature freeze Sun Nov 1.** |
| Mon Nov 2 to Sun Nov 8 | 5 Submit prep | Video recorded and edited. Devpost draft. |
| Mon Nov 9 to Wed Nov 11 | Buffer | Fixes only. **Submit Wed Nov 11.** Deadline Thu Nov 12, 3:00 PM Eastern. |

## Prize targets
- Grand Prize, or the Best Agentic Commerce honorable mention.
- One sponsor prize only (rules allow one): **Channel3**. The Buyer Pal's price check must call the Channel3 API for real.

## Open decisions for Matt
1. **Can a buyer override a `stop`?** Recommendation: yes for `caution`, no for `stop` flags tied to payment method (Friends & Family, off-platform). Pay Pals simply never creates anything but a Goods & Services checkout payment, so the override question only applies to price and photo flags.
2. **Who starts a deal?** Recommendation: either side. Seller usually does; buyer can paste a listing link to start one and invite the seller.
3. **Accounts for v1.** Recommendation: no sign-up. A deal link plus the party's email is enough for the hackathon.

## Status (Lead keeps this current)
| Lane | Status | Last merge |
|---|---|---|
| Lead: contracts, schema, fixtures | not started | |
| Lane 0 gate (builder-paypal) | waiting on Matt's sandbox credentials | |
| builder-agents | not started | |
| builder-paypal | not started | |
| builder-web | not started | |
| qa | not started | |
