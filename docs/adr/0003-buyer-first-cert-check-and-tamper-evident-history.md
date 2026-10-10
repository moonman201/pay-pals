# ADR 0003: buyer-first deals, grader cert check, tamper-evident history

Date: 2026-10-07. Status: accepted (Matt's product direction, two days before the contract freeze).

## Context
The first build day proved the mechanics: real PayPal sandbox orders to the seller, real Claude and Channel3, three scenarios end to end. Matt then changed the product's front door and added two proofs that make the pals' work checkable by someone outside the deal.

## Decisions

1. **The buyer starts the deal.** The entry point is a payment screen: the buyer taps "Use Pay Pals Protection," enters the seller's PayPal email and the listing link. The seller receives an invite link, joins and uploads photos. Seller-started deals remain, as the secondary path. A new state `INVITED` sits between DRAFT and LISTED. v1 shows the invite link for the buyer to send; email delivery is a stretch.

2. **Refusing the invite is a risk signal.** A seller who will not use Pay Pals and insists on Friends and Family or another unprotected method raises `INVITE_REFUSED`, a payment-method flag: stop, no override, deal BLOCKED. The Buyer Pal can review a refusal with no card at all; it then runs only the chat rules.

   *Amended 2026-10-10 (Matt).* This decision was written as "the strongest scam sign" and the wording is withdrawn. A refusal is a risk signal. It is not proof of fraud, and plenty of honest sellers refuse a tool they have never heard of. What the refusal does is end the path through Pay Pals, because Pay Pals only ever creates a Goods and Services payment. The block is on our payment path, not a finding about the person.

3. **Graded items are checked with the grader.** `ItemCard.certNumber` and `grade` carry the slab label. The Buyer Pal looks the cert up with PSA's public API (token `PSA_API_TOKEN`, disk-cached so tests never call it) and compares subject and grade with the card. A mismatch or a missing record is `CERT_MISMATCH`, stop. The verdict carries the grader's record.

4. **Deal history is hash-chained and anchored in PayPal's record.** Every `DealEvent` carries `prevHash` and `hash` (sha256 over canonical fields, `packages/contracts/src/history.ts`); the stores compute them on append under a lock. When the order is created, the chain head goes into the PayPal order's `custom_id` as `dealId#hash` and onto the payment record. The evidence pack recomputes the stored events and states whether they reproduce the head PayPal holds. Nobody can edit the history after payment without the mismatch showing.

   *Amended 2026-10-10 (Lead, batch item D11).* That last sentence needs its condition stated. It holds where a real PayPal order carries the head and we read that order back; then an edit to the stored events fails to reproduce the head PayPal holds. It does not hold for an example deal seeded from a scenario, where no PayPal order holds the head and the chain is only self-consistent, nor in a render where the live read of the order did not come back, where the comparison is against our own stored copy of the head rather than against PayPal's. Say what was checked and against what.

5. **Two demo items.** The PlayStation 5 with its box (clean deal, empty box) and a PSA-graded Pokemon slab (fake slab). The scam script is Matt's wording; no military references anywhere in demo data.

## Consequences
- Contracts v1.5.0-draft, migration 0003 (enum additions, new columns, hash backfill).
- `custom_id` is no longer a bare deal id; the webhook handler reads `invoice_id` first and parses `custom_id` otherwise.
- The landing page's primary action changes; demo scenarios fake-slab and clean-ps5 start as buyer-started.
- The freeze on Fri Oct 9 covers this version.
