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

## Contracts (v1.8.0, Oct 10. Frozen at v1.6.0 on Oct 8; Matt approved v1.7.0 and v1.8.0 on Oct 10, see the two PROPOSAL files in `coordination/`)

The TypeScript in `packages/contracts/src` is the contract. This section is the summary. Where they differ, the code wins and the Lead fixes this file.

### Changes in v1.7.0 (Matt approved, Oct 10)
Both additive. Nothing existing changed shape, so every v1.6.0 consumer still compiles and every stored row still parses.
- **`DEAL_EVENT_KINDS` gains `off_platform_chosen`**, between `state_changed` and `payment_created`. The buyer told Pay Pals they will pay outside Goods and Services; Pay Pals warned them, wrote the line, and stepped back. It is the end of Pay Pals' part, not the start of one. Needs migration 0005 and a re-bundle of `migrations.generated.ts`, because the Postgres enum is generated from this constant.
- **`PalReasoning`**, optional on `Verdict` and `ArrivalCheck`: `checked`, `found`, `couldNotVerify`, `wouldChangeMyMind`. Four lists of short plain sentences, so a pal's reasons can be laid out, tested and checked one claim at a time. No migration: verdicts round-trip as a single jsonb payload. A group may be empty but not absent, so a pal cannot quietly omit what it could not verify.

### Changes in v1.8.0 (Matt approved, Oct 10)
All additive and optional. No migration: an evidence pack and an arrival check
each round-trip as a single jsonb payload, and nothing in the repo parses either
strictly, so every pack and check stored before today still parses.
- **`HISTORY_ANCHORS` and `historyAnchor`**, on `EvidencePackSchema` and on `EvidenceInput`: `corroborated`, `recorded_only`, `not_anchored`. Absent reads as `recorded_only`, which never claims corroboration. Nothing may infer the case from an order id's shape; a `FIXTURE-` prefix is a convention, not a contract.
- **`ArrivalCheck.observed.serialSource`**, `photo` or `description`, set from `PhotoReading.source` where the check is built so both ends read one value.
- **`ArrivalCheck.outcome` replaces `matches`**, `match | mismatch | inconclusive`, plus an optional `unsettled: Mismatch[]` that is non-empty exactly when the outcome is inconclusive. `mismatches` stays empty on an inconclusive check, because a comparison that could not be settled did not find a difference. **This one is breaking**, chosen over the additive `boolean | null` for a measured reason: widening the boolean produced zero type errors repo-wide while leaving eight sites that would report an unsettled comparison as a confirmed mismatch, one of them persisting it into a table that is never updated in place. Matt took the breaking shape so the compiler names every site; it named 27 across four workspaces.
  **A correction to the line above: this change DOES need the stored data handled.** The Lead said v1.8.0 needed no migration, which is true of a jsonb payload's ability to parse any shape and false here, because `matches` was renamed rather than added. Every arrival check already in Neon carries `matches` and no `outcome`, and `toArrival` casts rather than parses, so nothing throws and `outcome` is simply `undefined` at runtime. `packages/db`'s `toArrival` translates a legacy row once (`true` to `match`, `false` to `mismatch`, neither to `inconclusive`), a malformed payload never reads as `match`, and `toArrivalRow` writes only the new shape. No data migration: the only arrival rows in Neon are on the two seeded demo deals plus the probe deals, all of which the final deploy re-seeds or deletes.
- **`ReviewProgress` and `ReviewOptions.onProgress`**, a fourth optional argument to `BuyerPal.review`. **This is a third change, not in the v1.8.0 proposal Matt approved.** Streaming findings to the page needs the agents package to emit while it works, and `review` was a single awaited call, so there was no non-contract way to do it short of moving the orchestration into the UI layer, which the module rules forbid. Events: `stage` for the staged status line, `flag` for a finding (a stop flag must reach the page as soon as it is raised), `priceCheck`, `certCheck`, `photoRead`. The lookups run concurrently, so these arrive in a different order every run and nothing may depend on the order. A throw from `onProgress` must not fail the review. The final `Verdict` stays the only authority; progress is never the record.

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

## Decisions 1 to 22 (Matt and the Lead, Oct 6 to Oct 10)

**There are 22, numbered in order, and the list runs to the end of this section.**
Said plainly because two lanes read this section, reached Decision 13, concluded
the list ended there and went to work off `WORKLOG.md` instead. The heading used
to say "Oct 6" while carrying decisions made four days later, which is a good way
to make a reader skip the ones that matter most. Today's are 12 to 22.
1. **Overrides.** A buyer can override `caution` flags. A buyer can never override a payment-method flag (`FRIENDS_AND_FAMILY_REQUEST`, `OFF_PLATFORM_PAYMENT`). Pay Pals only ever creates a Goods and Services checkout payment, so those flags end the deal. Encoded as `PAYMENT_METHOD_FLAGS` in `packages/contracts/src/red-flag.ts`.

2. **Who starts a deal.** Either side. The seller usually does; a buyer can paste a listing and invite the seller.

3. **Accounts.** None in v1. A deal link plus the party's email is enough.

4. **Brand names.** Real brand and product names are fine in demo data, UI and video. No copied logos or artwork.

5. **Two-sided agreement (Oct 7).** Both the buyer and the seller agree to a specific card version. The card locks and the deal moves to AGREED when the second agreement lands. A new card version clears both. Shipped Oct 7 as contracts v1.3.0-draft (3b71ad6).

6. **Non-payment stops (Oct 7).** A stop that is not about payment method (price far below market, ship-before-pay) stays overridable with the acknowledgment checkbox and stronger warning wording. Only payment-method flags end the deal.

7. **Buyer starts the deal (Oct 7).** Entry point is a payment screen: "Use Pay Pals Protection," seller PayPal email, listing link. Seller gets an invite link to join and upload photos. State `INVITED` between DRAFT and LISTED. A refusal ("Friends & Family only") is `INVITE_REFUSED`, a payment-method flag, non-overridable. Seller-started stays, secondary. Email delivery of the invite is a stretch; v1 shows a link to send.

8. **Two demo items (Oct 7).** PS5 (clean deal, empty box) and a PSA-graded Pokemon slab (fake slab). Buyer Pal checks graded items against PSA's cert API; a mismatch is `CERT_MISMATCH`, stop.

9. **Tamper-evident history (Oct 7).** Every DealEvent carries prevHash and hash (contracts history.ts). The chain head at order creation goes into the PayPal order custom_id (`dealId#hash`) and the payment record. The evidence pack verifies the stored events against it.

10. **Scenario 3 ship-time check (Oct 7, Matt).** The seller never answers the Buyer Pal's questions and the buyer pays anyway; when the seller ships without the required packing photo the Buyer Pal raises a caution at ship time and the evidence pack calls out the unanswered questions and the missing photo. Approved Oct 8. Contracts v1.6.0-draft: flag code `MISSING_PACKING_PHOTO`, `BuyerPal.checkShipment`, `Shipment.flags?`, `EvidencePack.unansweredQuestions?` and `shipmentFlags?`, event kind `shipment_checked`, `shipments.flags` column (migration 0004).

11. **Sandbox buyer login on the pay panel (Oct 8, Matt).** On a demo deal with the sandbox gateway, the pay panel shows the PayPal sandbox buyer email and password, labelled as a test account with no real money, so a judge can finish the clean and empty-box scenarios live.

12. **Payment stays Goods and Services only (Oct 10, Matt).** Pay Pals only ever
    processes a PayPal Goods and Services checkout payment. It never processes a
    Friends and Family payment. What changes is who gets the checks: **anyone can
    start a deal and get the full set** (Buyer Pal review, item card, cert check,
    scam flags) **no matter how they plan to pay**. If the buyer then chooses to
    pay outside Goods and Services, Pay Pals says plainly "You're on your own
    from here: no PayPal protection and no dispute path," records that on the
    timeline, and steps back. A seller pushing Friends and Family is still a flag.
    Recording it on the timeline needs one new event kind, which is a contract and
    schema change, so that half is **parked on `coordination/PROPOSAL-contracts-v1.7.0.md`**
    pending Matt. The rest of the decision needs no contract change.

13. **"Verified" on an evidence item (Oct 10, Lead, reconciling the Oct 9 rule).**
    The Oct 9 wording rule below says never "verified" and never "authentic". Batch
    item E12 asks for every item in the deal status view to be labelled Verified,
    Unverified or Missing. These do not conflict, and the distinction is the one
    section D of that batch is about. "Verified" may describe **an evidence item we
    checked against something**, and the view must say what it was checked against
    (a console serial against the box label, a cert against the grader's record, a
    capture against PayPal's own order). It may never describe **the item itself**:
    never "verified authentic", never "verified owner", never "verified seller".
    Where the subject is the goods or the person, say what was checked and against
    what, as the Oct 9 rule requires.

14. **A reason group may be empty; it may never be padded (Oct 10, Lead).**
    `PalReasoning`'s four groups exist so a pal's reasons can be checked one claim
    at a time, which only works if each line is a thing that actually happened.
    An empty group is a true statement about a pal that checked nothing in that
    category. A group filled with work that was not done is a lie in the one field
    built to prevent lying. Two cases decided today: an arrival check with no
    photos returns an empty `checked` rather than "Nothing yet, no arrival photos
    have been added", and the empty-box arrival no longer lists a serial
    comparison it could not make while `couldNotVerify` on the same page says
    there was nothing to read. `couldNotVerify` remains the exception in the
    other direction: it always renders, printing "Nothing. Everything I set out
    to check, I could check." when empty, so a pal cannot hide behind a blank.

15. **Where one end can carry a value, the other reads it (Oct 10, Lead).**
    Two of reality-check's six findings were the same defect: `packages/agents`
    and `apps/web` each deriving the same fact separately and drifting. The
    tamper-check sentence claimed PayPal corroboration while `HistoryBadge`
    correctly said no order held the hash; the status view said the pal read a
    serial off a photo while the pal's own reasons said it did not. Both ends
    were reasonable alone. When a fact is known where a value is produced, it
    gets carried on the contract rather than re-derived by each reader, even
    when re-deriving looks easy. Pattern-matching a convention, such as a
    `FIXTURE-` id prefix, is re-deriving. See `coordination/PROPOSAL-contracts-v1.8.0.md`.

16. **A test written beside a claim cannot check it (Oct 10, Lead).**
    Three tests were found today asserting things the product could not support:
    `packages/agents/src/buyer/buyer-pal.test.ts:441` required "confirmed on the
    item itself" on a path that read a caption rather than a photo;
    `packages/agents/src/evidence/evidence.test.ts` required the pack to say
    PayPal corroborated the history hash; and
    `tests/integration/src/review-oct7-hash-badge.test.tsx:90` required the same
    phrase one layer down. In each case the sentence and the test asserting it
    were written in the same change and reviewed together, so the test could
    never have caught the overclaim; it pinned it. None of them was found by the
    suite. All three were found by reading the product's own output, two by
    `reality-check` and one by the lane that removed the claim.
    **What follows:** a test that asserts a claim about the world (what a pal
    saw, what PayPal holds, what was checked against what) is worth no more than
    the claim was when it was written, so it earns a second pair of eyes on the
    claim and not just on the test. When such an assertion has to change, it is
    corrected with a dated reason saying the expectation was wrong rather than
    the code, so the record shows a correction and not a test weakened to go
    green. A `.not.toContain` left pointing at a phrase that no longer exists
    passes vacuously, which is worse than failing, because it reads as coverage.

17. **Contracts v1.8.0 approved (Oct 10, Matt).** Both additive optional fields
    from `coordination/PROPOSAL-contracts-v1.8.0.md`. `EvidenceInput.historyAnchor`
    and the same field on `EvidencePackSchema`: `corroborated` when PayPal's order
    was read for this pack and its `custom_id` carries the same hash,
    `recorded_only` when a real order holds it but it was not read back,
    `not_anchored` when no PayPal order holds it at all. Absent is read as
    `recorded_only`, the conservative case, so it never claims corroboration.
    `ArrivalCheck.observed.serialSource`: `photo` or `description`, set from
    `PhotoReading.source` where the check is built, read by both ends.
    No migration either side: both round-trip as jsonb. The prompt at
    `summary.ts` must stay conditioned on the same field, because it previously
    told the model PayPal holds the hash and the model put the claim back on its
    own after the deterministic prose was fixed.

18. **The serial near-miss band approved (Oct 10, Matt), both stages.** The model
    misreads the box label about 1 run in 5, in three observed ways: `O` for `0`,
    `Q` for `0`, and a dropped digit. After `normalizeSerial`, compare by
    Levenshtein distance: **0 is a match**, **1 is inconclusive**, **2 or more is a
    mismatch**. Distance 1 covers one substitution, insertion or deletion, which
    is what makes it cover all three faults; a confusable-pair fold would not have
    caught the dropped digit at all, which is why that option was rejected.
    Inconclusive means **claim neither**: name both numbers, say where they differ,
    ask for a clearer photo of the label, and put it in `couldNotVerify`. Two
    scoping conditions, which matter as much as the rule: only when **at least one
    side came from an OCR read**, because the band exists for lossy vision reading
    and must not soften a comparison between two typed numbers, and only when the
    longer serial is **8 characters or more**, since on a short identifier one edit
    is too large a fraction. Accepted cost, stated before approval: two consoles
    off one production line can be a digit apart, so a genuinely wrong item can
    land in the band. It is accepted because the pal does not say "matches"
    either; it withholds and asks, failing toward asking. It does not weaken the
    empty-box scenario, whose mismatch is an absent serial, not a near miss.
    Ships in two stages: `rules/box-serial-mismatch.ts` needs no contract change,
    and `arrival.ts` waits on a third state because `ArrivalCheck.matches` is a
    boolean today and reporting inconclusive as `false` would be wrong in exactly
    the way this rule exists to stop. Test the fix on the real-photos review,
    which is the only test that actually fetches the file; the Seller Pal test
    reads captions.

19. **Reviews run concurrently and stream their findings (Oct 10, Matt).** A real
    review takes 18 to 65 seconds measured, and the slowest is fake-slab, the
    scenario the landing recommends first. The cert lookup, the price lookup and
    the photo reads are to run **concurrently**, and **each finding streams to the
    page the moment it lands**: a stop flag shows as soon as it comes back, not
    after the full review. The staged status line stays, for whatever is still
    running. Measure review time before and after on all three scenarios and
    record the numbers. Two rules that come with it:
    - **Agree stays locked until the review is complete.** A buyer must never be
      able to agree on partial findings. The status line says why it is locked.
      A test must try to agree mid-stream and fail.
    - **Findings arrive in a different order every run.** Playwright visual
      baselines snapshot the **finished** review only, never mid-stream.
      Streaming tests assert on content (each finding appears; a stop flag shows
      before completion when there is one), never on order.

20. **The honesty rule, generalised (Oct 10, Matt).** When anything is missing,
    failed or still running, the pal says so plainly and never fills the gap with
    a reassuring claim. This is the rule behind the serial band, `historyAnchor`,
    the streaming status line and every fix in the Oct 10 batch's section D. It is
    the one to apply when a new case appears that no decision here covers.

21. **Only push `main` when the gate is green (Oct 10, Matt).** Every push to
    `main` deploys to production, because Vercel builds this repo from the GitHub
    integration and `apps/web/vercel.json` carries `"ignoreCommand": "exit 1"` so
    that no push is skipped. There is no Vercel CLI on this machine and
    `.vercel/project.json` holds a `local-sim` placeholder rather than a real
    project link, so a push **is** the deploy and there is no manual step to hold
    it back. The gate is the one in [[pay-pals-gate-is-not-just-npm-test]]:
    `npm run gate` (copy guard, typecheck, build, keyless), the keyed run, and
    the e2e suite, each exit code read on its own and never piped into something
    that swallows it. Lane branches and the theme branch are free to be red;
    `main` is not.

22. **Two things owed at the final deploy and smoke (Oct 10, Matt).**
    (a) **Re-seed the three demo deals.** They were seeded 2026-10-08 and a
    seeded verdict is frozen at seed time, so the whole Oct 10 batch is invisible
    on the finished-deal pages: no `PalReasoning` groups, the old PS5 price range,
    the old tamper wording. **Done on Oct 11** at Matt's instruction rather than at
    the end: `SEED_VERSION` is now `2026-10-10.1`, the three stale seeds were swept
    and the demo deals re-seeded on current code, verified on production.
    The procedure, for the next time, and **the command changed on Oct 11**: bump
    `SEED_VERSION` in `apps/web/lib/demo/seed-version.ts`, then
    `npm run db:delete-seeded-demo-deals -w packages/db -- --sweep --keep-seed <version> --yes`,
    then push, because a cold start is what re-seeds. The sweep is now opt-in and a
    deleting sweep must say what it keeps: `--sweep --yes` with no `--keep-seed` is
    refused, and `--keep-seed none` is the spelled-out way to delete every stamped
    seed. The old form, with no mode, now exits 2. Building the id list for `--id`
    in zsh needs `${=ARGS}`; an unsplit variable is refused with that advice.
    (b) **Delete the Lead's production smoke deal**, `3e28036c-77f1-49e1-9f5d-f9184fcdbf84`,
    a clean-ps5 deal started on production on Oct 10 to prove the live model
    carries the new reason groups. It is **unstamped**, so the delete script will
    not touch it, by design: a visitor's own deal was never ours to remove. It
    needs deleting by id, which means the script needs a `--deal <id>` option or
    an equivalent. qa also left five unfinished probe deals on Oct 10
    (73c44fa0, 2845c8ea, f0a403dd, 6e077c43, b0b6aa10); none is stamped, none is
    linked from the landing, and the same option would clear them.

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

## Judge walk, Oct 8 (reality-check item 16). Lane assignments
Branch `judge-walk`, merged to main caf27aa on Oct 8, stale seeds deleted from Neon and re-seeded on deploy. Same rules as the Oct 7 review. Full report in WORKLOG; the agents are real (different prose per run, re-review changes the answer, chain head verified on a live PayPal order) but several claims are unfounded and the seeded deals on Neon predate the Oct 7 fixes.

| # | Lane | Fix |
|---|---|---|
| J1 | Matt | 13 of 13 demo photos 404. `assets/demo-photos` is empty. Until files exist every photo sentence is unfounded. |
| J2 | builder-agents | Cert check honesty: with the fixture lookup (no PSA access) an unknown cert is "not checked", never a stop, and no prose may say "PSA's own database" or "we checked PSA". Only a real PSA not-found is a mismatch. The structured line and the pal message must agree. |
| J3 | builder-agents | Ungrounded photo claims: when no image was read, the model may not conclude anything about photo content ("not a stock photo listing"); the pal message states what it looked at and nothing more. Post-check the message. |
| J4 | builder-web | Unknown market range renders "$0 to $0 via Channel3". Show "No reliable market price found" and the source note instead; never render a range when low equals high or either is 0. |
| J5 | builder-web | "NEXT STEP: Agree and lock the card" shows on PAYMENT_PENDING with a locked card. Agree only in REVIEWED. |
| J6 | builder-web | Evidence page and pay panel say "PayPal's own record holds it" and show FIXTURE-ORDER ids for seeded deals with no PayPal order. Seeded deals get an "Example deal, seeded from a scenario" label, the tamper section says the hash is chained but not anchored until there is a real order, and FIXTURE ids are shown as "example order id". Goes away at the Oct 23 re-seed. |
| J7 | builder-web | Seed versioning: the seeder stamps deal_created data with a seed version; on startup a seeded deal whose version differs is logged as stale. builder-paypal ships `npm run db:delete-seeded-demo-deals` for the Lead to run before a redeploy re-seeds. Lead runs it now so the live seeds reflect today's fixes. |
| J8 | builder-web | "Or upload a file (local dev only)" visible on the hosted site; photo captions render twice; invite event text now reads "Invite link created for the seller" (fixtures changed). |
| J9 | builder-paypal | PayPal item description truncates mid-word at 127 characters. Trim at a word boundary with an ellipsis. Plus the delete-seeded-deals script for J7. |
| J10 | Lead (fixtures) | clean-ps5 timeline now has a fresh review after card v2 (REVIEWED to LISTED, review_posted, LISTED to REVIEWED) so the seeded verdict matches the locked version. Done. |
| J11 | Matt (product) | Scenario 3 is unplayable on the hosted site past payment: it needs a real sandbox capture and the page offers no buyer login. Options in BLOCKERS. |
| J12 | qa | Tests for J2 to J6 and J8; re-run the finished-deal screenshot pass after the re-seed. |

## Visual pass, Oct 9 (Matt). Lane assignments
Branch `visual`, merged to main ee70456 on Oct 9 with Matt's approval, production deployed and the demo deals re-seeded. Done. Stop only for a contract or schema change or a change to the product copy's meaning. Goal: the site looks like a product a judge remembers, built around the two Pals (blue Buyer Pal, gold Seller Pal) from `assets/pay-pals-hero.jpg`. Design is one of five judging criteria.

| # | Lane | Work |
|---|---|---|
| 1 | builder-web | Hero: the Pals above the fold next to "Two AI agents. One safe deal." Hero copied into apps/web/public, optimized with next/image and sizes for phone and desktop. No PayPal logo artwork outside the official buttons. |
| 2 | builder-web | Pal avatars (blue Buyer Pal, gold Seller Pal) in the hero's style, used wherever a pal speaks: review, private pal messages, timeline, flag cards, the landing steps. |
| 3 | builder-web | Color system in one token file: buyer blue, seller gold, stop red, caution amber, go green; light and dark; WCAG AA contrast. |
| 4 | builder-web | Deal progress stepper on every deal page: Invited, Card built, Reviewed, Agreed and locked, Paid, Shipped, Arrived; current step highlighted; blocked and issue states clear. |
| 5 | builder-web | The Buyer Pal's Stop / Go / Caution is the loudest thing on the review, avatar beside it. |
| 6 | builder-web | Locked item card styled like a physical card or receipt: visible lock state and version; the "this is the text of the PayPal order" line feels official. |
| 7 | builder-web | Side-by-side comparisons: cert check (card says vs PSA record says) and arrival check (locked card vs what arrived), mismatches highlighted. |
| 8 | builder-web | "History unchanged since PayPal order" as a proper verified seal. |
| 9 | builder-web | Scenario cards with their outcome visual (blocked shield, green check, open issue) and the pal avatars. |
| 10 | builder-web | Subtle motion only (card lock, stepper advance, flag reveal), prefers-reduced-motion respected. |
| 11 | builder-web | Phone first: no horizontal scroll, 16 px gutters, tap targets at least 44 px. |
| 12 | builder-agents | Until real photos exist, do not render the "could not be loaded" photo sentences on the hosted site; keep the logic. |
| 13 | builder-agents | `assets/demo-photos/SHOTLIST.md`: the 13 photos plus the reference folder, exact filename, what the shot must show, what the pal reads from it. |
| 14 | qa | Playwright for the new layout; visual checks at 1280 and 390 px for the landing, the three finished deals and both evidence packs. Before screenshots from production, after screenshots from the preview, committed under docs/visual-pass/ on the branch. |
| 15 | qa | gitleaks or trufflehog over the full git history before the repo goes public. Report; never rewrite history without Matt. |
| 16 | reality-check | Review the preview as a first-time judge on a phone: confusing, cluttered, forgettable. Done; notes in docs/visual-pass/README.md. |

**Matt's decisions, Oct 9.** (1) Price panel shows the count and the prices only, no retailer names, with "via Channel3" still visible. Not yet built; it waits with everything else. (2) The hero keeps the PayPal badges as supplied. (3) Re-seeding the demo deals is approved, but only after Matt approves the merge to main. Polish is stopped until Matt replies.

## Oct 10 batch (Matt). Lane assignments

One batch, eight sections, A to H. Matt's order: build on `main` first, then rebase
the parked `day-night-modes` branch onto it; qa refreshes visual baselines **once**,
after both have landed, not twice. Matt's speed rule: commit each item, but run the
full gate (keyed and keyless, all e2e) once per section rather than per commit, run
only the unit tests and the affected e2e spec in between, refresh baselines once at
the end, and deploy and smoke production once per section.

Stop rule for this batch: a contract change past v1.6.0 earns a stop with the
proposed change written out. Two items hit it, see
`coordination/PROPOSAL-contracts-v1.7.0.md`. Everything else keeps moving.

**Sequencing, confirmed by Matt Oct 10.** Sections A to F and H landed on `main`
in 48a640a and were pushed. Then: one more round on `main` (contracts v1.8.0,
builder-agents, builder-web), then the theme branch rebases **once** onto final
`main`, then G16 and Matt's preview screenshots, then baselines refreshed
**once**, then deploy and smoke. Matt does not want the preview sooner at the
cost of a second rebase. Baselines refresh once for the whole batch; production
deploy and smoke once per section, not per fix.

**Two loose ends from the batch instruction itself.** Item H18 arrived truncated
mid-sentence after "how to log into the sandbox test buyer," and the full text
has not been supplied, so the README section covers what was legible and the
rest is still missing. Item G17 asks the Lead to repeat "your open deal room
question" in the preview report; no such question is recorded anywhere in
`coordination/` or `docs/`, and Matt will answer it when he sees the preview at
the end of Section 2.

| # | Item | Lane | Status |
|---|---|---|---|
| A | Payment stays Goods and Services only; everyone gets the full checks; an off-platform choice is warned, recorded and stepped back from | builder-web, needs a new event kind | **PARKED** on the v1.7.0 proposal (contract + schema) |
| B1 | Pay panel and evidence pack split into "Confirmed by PayPal" (read back with GET order, not from our database) and "Recorded by Pay Pals" | builder-web | in flight. No contract change needed: `PayPalsGateway` in packages/paypal already publishes `getOrder` |
| B2 | Show the PayPal order carries the history hash in `custom_id`, and the history check against it | builder-web | in flight |
| B3 | Keep the Oct 23 re-seed: finished demo deals get real sandbox order and capture ids | builder-paypal (tooling check only, no re-seed now) | in flight |
| B4 | Assessment only: can the sandbox Disputes API open or simulate a dispute and accept our evidence pack, and what would it cost | builder-paypal | in flight, lands as `docs/paypal-disputes-assessment.md` |
| C5 | Every pal decision shows what it checked, what it found, what it could not verify and what would change its mind | builder-agents + builder-web | **PARKED** on the v1.7.0 proposal (contract, no migration) |
| C6 | New evidence shows the before and after verdict side by side with what changed it | builder-web | in flight, derived from the verdicts array, no contract change |
| C7 | Confirm the "Play as" flows run the live model on production, not fixtures; one test with a photo outside the fixtures | qa | in flight |
| D8 | Refusing Pay Pals is "a risk signal", never "the strongest warning sign", never proof of fraud | Lead (done, f89f268), builder-web, builder-agents | Lead done; lanes in flight |
| D9 | A matching serial or cert supports the listing; it never proves ownership or authenticity | Lead (done in the slab fixture, 659b461), builder-web, builder-agents | Lead done; lanes in flight |
| D10 | The evidence pack is "useful context for a PayPal dispute", never a guaranteed outcome | builder-web, builder-agents | in flight |
| D11 | The audit chain is "the official record of the deal that PayPal can check first"; never say a refund or dispute requires it | Lead (done, f89f268), builder-web, builder-agents | Lead done; lanes in flight |
| E12 | One grouped status view per deal, every item labelled Verified, Unverified or Missing (see Decision 13) | builder-web | in flight |
| F13 | PS5 comps: consoles only, the same range for the same console in both PS5 scenarios | builder-agents | in flight, closes REVIEW finding 44 |
| F14 | Slab: no price claim anywhere including the landing card; lead on the stolen photo, the refused dated note, the Friends and Family push | Lead (fixtures) | **DONE** 659b461, closes REVIEW finding 46 |
| F15 | Remove the dead demo deal id from the landing | builder-web | in flight, closes the Oct 9 warm-instance finding |
| G16 | Default to night for every visitor with no stored choice, whatever the device says; the header toggle switches to day and remembers it | builder-web, after the rebase | not started, Section 2 |
| G17 | Deploy the rebased branch to a preview; screenshots at 1280 and 390 of the landing, one deal room and the evidence pack, in both modes; do not merge the theme to main until Matt approves | Lead + qa, after the rebase | not started, Section 2 |
| H18 | README "Try it yourself": live URL, the three scenarios in order, how to sign in as the sandbox test buyer | Lead | **DONE** 94ce4e2, and the instruction arrived truncated, see the worklog |

## Next: candidate features (recorded Oct 9, not built)

The pitch these serve: anywhere people can pay with PayPal, Pay Pals gives them a reason to choose Goods and Services. Wording rule for all of these, in code, copy and video: never "verified" and never "authentic". Say what was checked and against what.

### A. "Pay Pals Protected" listing link (hackathon candidate)
The seller builds and locks the card first, then pastes a public link into a listing anywhere. Two paths behind one link:
- **Direct PayPal sale** (online marketplace, groups, forums): today's flow. The locked card text and the history hash go into our own PayPal order, payee is the seller.
- **Platform checkout with PayPal as the payment method** (eBay): we keep the card, the packing photos, the tracking, the arrival check and the evidence pack, plus the platform's own order reference. We do not create the order, so no payee of ours, no card text on the order, no hash in custom_id.
- The Buyer Pal flags a "Pay Pals Protected" claim whose link does not resolve to a locked card.

What changes: `Deal` gains a listing mode, a public link id, an external order reference and a platform name; a `PUBLISHED` state for a locked card with no buyer yet; `lockCard` becomes legal with one side in that state; `PaymentRecord` gains a source and an external reference and its PayPal order id becomes nullable; one red flag code; two event kinds. Schema: four deal columns, three payment columns, one state enum value, one unique index.

**How a dispute works on an eBay purchase paid with PayPal.** Two independent paths, and the buyer picks one:
- eBay's Money Back Guarantee, opened on eBay, decided by eBay. Seller response window about three business days.
- A PayPal payment dispute, opened with PayPal, decided by PayPal under its own terms, not eBay's. Seller response window about five calendar days for an external payment dispute.
Since late 2021 eBay processes payments itself (Adyen) and sellers are not paid into PayPal, so on that path the money never lands in a PayPal account we control. Our evidence pack is useful to either process as attachable proof, and that is all we should claim for it. Sources: eBay's "Handling payment disputes" help page and PayPal's Purchase Protection program page.

### B. Local pickup (hackathon candidate)
At the meetup the buyer points a phone at the item, the Buyer Pal reads the serial against the locked card, and Pay unlocks only on a match.

**What PayPal's protection actually covers in person, checked Oct 9 against PayPal's Purchase Protection program page (policy current as of Jan 26, 2026).** For a non-QR-code payment, a purchase is **not** eligible for an Item Not Received claim if the buyer paid in person, or ordered online and collected the item in person. It **may** be eligible if the item picked up is Significantly Not as Described. The exception is paying in person by scanning a PayPal **goods and services QR code**: that may be eligible for Purchase Protection, and the seller handing over in person may be eligible for Seller Protection, though PayPal can ask for other evidence of delivery. So:
- Copy may say the pickup flow helps with an item that is not as described. It must never say it covers an item that never arrived, because for a pickup that claim is not available.
- If we want the strongest protection story for pickup, the payment should be a PayPal goods and services QR code, which PayPal's own app creates. We cannot attach our card text or history hash to a QR code payment, so the card and the hash stay on our side and the pack is the link between them.

What changes: `Deal` gains a handoff mode; the state table gains PAID to DELIVERED so a pickup skips shipping; the verdict kind enum gains a pickup check and the store must hold more than one check per deal; anything that assumes an arrival check exists only after delivery.

### C. Venmo purchase protection nudge (roadmap)
Venmo's protected path for buying from a stranger, surfaced the same way: the pal explains which Venmo option carries protection and which does not, before the money moves.

### D. Tickets (roadmap)
The card is section, row and seat. Arrival is the transfer being accepted in the ticket account rather than a package. The same lock, the same evidence pack, the same hash.

### E. Seller track record on the link (roadmap)
Computed only from completed deals: how many, over what period, how many ended in an issue. No stars, no badges, no claim about the person. Just counted history.

### F. "Already scammed" triage (roadmap)
Someone who already sent Friends and Family: what is still possible, what is not, what to gather, where to report. Honest about the fact that Friends and Family has no purchase protection.

Explicitly out: deposits on cars, pets and rentals.

## Status (Lead keeps this current)
| Lane | Status | Last merge |
|---|---|---|
| Lead: contracts, schema, fixtures | v1.6.0 frozen Oct 8: buyer-first deals, PSA cert check, hash-chained history, two demo items, ship-time check. Changes after this need a worklog post and a version bump. | 2026-10-08 |
| Lane 0 gate (builder-paypal) | PASS personal and PASS business, sandbox, 2026-10-07. Personal payee cannot take direct card funding; wallet flow works. | |
| builder-agents | merged 9e83667 plus follow-ups (v1.1.0 fields, model stop cap, grounded model flags, battery-health ask). 80 tests, reality-check holds; real Claude runs: scam stop, clean go. Real Claude tests ran 3/3; Channel3 live schema unverified until a key lands. | 2026-10-07 |
| builder-paypal | merged 61c7ca0, follow-up merged (v1.2.0 types, raw bodies, dispute via table, skip flag, gate prints deal id). 83 tests, reality-check holds. | 2026-10-07 |
| builder-web | merged 77114c6: real agents, db and paypal behind lib/services.ts, demo mode with no keys, webhook route, PAY_PALS_DEMO_ONLY switch. Reality-check holds incl. a real sandbox order. Milestone "all three on real modules" (due Oct 23) met Oct 7 except the SDK buttons (no public client id yet) and Postgres (no DATABASE_URL yet). | 2026-10-07 |
| qa | merged 3b71ad6: 30 integration tests; Playwright for all three scenarios, re-agree path and phone width, 6 specs green. Fixture milestone (due Oct 17) met Oct 7. | 2026-10-07 |
