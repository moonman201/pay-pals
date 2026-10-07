# ADR 0002: deal rules and pal guardrails decided during the build

Date: 2026-10-07. Status: accepted.

## Context
The first full build day put every lane on main. Several rules that PLAN.md left open were decided while wiring the pieces together. This records them so nobody relitigates them from the code alone.

## Decisions

1. **Payment-method flags end the deal.** A Friends and Family request or any off-platform payment ask is always severity stop, the buyer gets no override, and the deal moves to BLOCKED from the review itself. Pay Pals only ever creates a Goods and Services checkout order. (`PAYMENT_METHOD_FLAGS` in contracts; `review.ts` in apps/web.)

2. **A caution can be overridden, with an explicit acknowledgment.** Non-payment stops (price far below market, ship-before-pay) stay overridable behind a sterner three-sentence warning and the label "I read the warning and I still want to continue." Decided by Matt, Oct 7.

3. **The model never manufactures a stop.** Rules decide what is a flag. The model may add flags only with evidence that appears in the chat or on the card, may raise a severity, and may reword. A model raise is capped at caution except for payment-method and price codes. Missing answers are questions for the seller, not flags. Three questions at most. (`merge-flags.ts`, `grounding.ts` in packages/agents.)

4. **ISSUE is reachable from PAID and SHIPPED as well as DELIVERED.** An item that never arrives, a seller who goes quiet, or a PayPal dispute opened before delivery are issues too. The issue step takes a reason. COMPLETE stays terminal; a dispute after COMPLETE marks the payment disputed and records the event.

5. **Card writes follow the deal state.** A card version can be saved only in DRAFT, LISTED or REVIEWED, and locked only from REVIEWED or AGREED, for the current version. Both stores enforce it through one conformance suite.

6. **The locked card is the order.** Payee is the seller's PayPal email, one line item carries title, serial and condition within PayPal's field limits, custom_id and invoice_id are the deal id. A deal can be paid once. Sellers do not need a business account: Lane 0 proved a personal sandbox payee receives a wallet payment. Personal payees cannot take direct card funding, so the buttons are PayPal and Venmo wallet only.

7. **Demo mode is real code with fixture data.** With no keys, the app runs the real rule engine, the real stores and a mock gateway. `PAY_PALS_DEMO_ONLY=1` forces that mode even when keys exist, and the Playwright suite always runs that way so a test run never spends a Claude or PayPal call.

8. **Webhooks are idempotent and verified first.** The route verifies the signature on the raw body before anything else, claims the event id, and releases the claim if handling fails so PayPal's retry is processed.

## Consequences
- The three demo scenarios are driven end to end by Playwright on every merge, with no keys.
- Turning on a key changes one log line, never a code path outside `apps/web/lib/services.ts`.
- **Agreement is two-sided** (decided by Matt, Oct 7). Each side agrees to a card version; the second agreement locks the card and moves the deal to AGREED; a new card version clears both and needs a fresh review. `Deal.buyerAgreedAt`, `Deal.sellerAgreedAt`, `DealStore.recordAgreement`, migration 0001.
