# ADR 0003: buyer-first deals, grader cert check, tamper-evident history

Date: 2026-10-07. Status: accepted (Matt's product direction, two days before the contract freeze).

## Context
The first build day proved the mechanics: real PayPal sandbox orders to the seller, real Claude and Channel3, three scenarios end to end. Matt then changed the product's front door and added two proofs that make the pals' work checkable by someone outside the deal.

## Decisions

1. **The buyer starts the deal.** The entry point is a payment screen: the buyer taps "Use Pay Pals Protection," enters the seller's PayPal email and the listing link. The seller receives an invite link, joins and uploads photos. Seller-started deals remain, as the secondary path. A new state `INVITED` sits between DRAFT and LISTED. v1 shows the invite link for the buyer to send; email delivery is a stretch.

2. **Refusing the invite is the strongest scam sign.** A seller who will not use Pay Pals and insists on Friends and Family or another unprotected method raises `INVITE_REFUSED`, a payment-method flag: stop, no override, deal BLOCKED. The Buyer Pal can review a refusal with no card at all; it then runs only the chat rules.

3. **Graded items are checked with the grader.** `ItemCard.certNumber` and `grade` carry the slab label. The Buyer Pal looks the cert up with PSA's public API (token `PSA_API_TOKEN`, disk-cached so tests never call it) and compares subject and grade with the card. A mismatch or a missing record is `CERT_MISMATCH`, stop. The verdict carries the grader's record.

4. **Deal history is hash-chained and anchored in PayPal's record.** Every `DealEvent` carries `prevHash` and `hash` (sha256 over canonical fields, `packages/contracts/src/history.ts`); the stores compute them on append under a lock. When the order is created, the chain head goes into the PayPal order's `custom_id` as `dealId#hash` and onto the payment record. The evidence pack recomputes the stored events and states whether they reproduce the head PayPal holds. Nobody can edit the history after payment without the mismatch showing.

5. **Two demo items.** The PlayStation 5 with its box (clean deal, empty box) and a PSA-graded Pokemon slab (fake slab). The scam script is Matt's wording; no military references anywhere in demo data.

## Consequences
- Contracts v1.5.0-draft, migration 0003 (enum additions, new columns, hash backfill).
- `custom_id` is no longer a bare deal id; the webhook handler reads `invoice_id` first and parses `custom_id` otherwise.
- The landing page's primary action changes; demo scenarios fake-slab and clean-ps5 start as buyer-started.
- The freeze on Fri Oct 9 covers this version.
