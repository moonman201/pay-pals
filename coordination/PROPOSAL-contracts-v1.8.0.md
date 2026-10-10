# Proposed: contracts v1.8.0

Written 2026-10-10 by the Lead, for Matt. **Status: waiting on Matt.** Nothing in
this file is built. Contracts stay at v1.7.0 until Matt says otherwise.

Round two, from reality-check's pass over the Oct 10 batch. Both changes are
additive and optional, like v1.7.0's. Both exist for the same reason: **two ends
of the product are each deriving the same fact separately, and they have
drifted.** That pattern produced two of today's six findings, so the proposal is
less about new capability than about removing a class of defect.

**Neither change blocks anything.** Honest interim wording is shipping now for
both, so nothing on the live site overclaims while this waits. What the proposal
buys back is the strong, true version of two claims that the interim has to
understate.

---

## Change 1: `historyAnchor`, so the tamper check can say which case it is in

### The finding
`packages/agents/src/evidence/summary.ts:76` builds the tamper-check sentence
from `payment.historyHash` alone. On the seeded empty-box evidence page it
produced these two paragraphs on one page:

> Tamper check: the deal history hash recorded on the PayPal order at payment
> time is 9175e7bf... The 20 stored timeline events reproduce that hash, so the
> history was not edited after payment.

> This is an example deal seeded from a scenario. Its 21 events are
> hash-chained, so an edit would break the chain, but no PayPal order holds the
> head: the payment ids are placeholders.

The second is right. `HistoryBadge.tsx:50` already nulls the hash for example
deals for exactly this reason; the prose never got the same treatment.

### Why v1.7.0 cannot hold it
builder-agents established, by reading rather than guessing, that the three
cases cannot be distinguished from `EvidenceInput`:

- The input is `{ deal, lockedCard, verdicts, arrivalCheck, messages, payment, shipment, timeline, arrivalPhotos?, requestedBy }`. Nothing about anchoring or liveness.
- `PaymentRecord.historyHash` is our own stored copy with no provenance.
- The seeded-example case is detectable today only through the `FIXTURE-` id prefix and `readSeedStamp`, both of which live in `apps/web` and neither of which is in contracts. I forbade pattern-matching the prefix because it is a convention, not a contract.
- `deal.scenario` is **not** a usable proxy. I checked this myself rather than take it on trust: `sandboxBuyerFor` at `apps/web/lib/deal/snapshot.ts:60` keys real sandbox deals off `deal.scenario !== null`, so a scenario-derived deal with a real order has it set too.
- The "read back live" case is not detectable at all. The live read happens in `OrderHistoryPanel.tsx`; `buildEvidenceFor` never does one and never learns whether one happened.

### The change
One optional field on `EvidenceInput` in `packages/contracts/src/agents.ts`,
and the same field on `EvidencePackSchema` beside `historyHash` and
`historyVerified`:

```ts
/** Where the hash on `payment` stands against PayPal's own copy.
 *  "corroborated":  PayPal's order was read for this pack and its custom_id carries the same hash.
 *  "recorded_only": a real PayPal order holds it, but it was not read back for this pack.
 *  "not_anchored":  no PayPal order holds it (seeded example deal, placeholder ids).
 *  Absent is read as "recorded_only", the conservative case: it never claims corroboration. */
historyAnchor?: "corroborated" | "recorded_only" | "not_anchored";
```

Putting it on the pack as well as the input is the part that prevents the next
drift: `EvidencePackView` then renders anchoring from the same value the
summary was written from, rather than recomputing it from the order id's shape.

### What it drags with it
**No migration.** An evidence pack is stored as a jsonb payload, the same as a
verdict, and nothing in the repo parses these schemas strictly. Optional, so
every existing caller still compiles and every stored pack still parses.
`apps/web` can already supply the value: `isExampleDeal(events, payment)` gives
`not_anchored`, everything else is `recorded_only` today, and `corroborated`
arrives when someone wires a live read into the pack build.

One thing builder-agents caught that a code-only fix would have missed: the
prompt at `summary.ts:117` tells the model *"The deal history hash recorded on
the PayPal order is the official record of the deal that PayPal can check
first"*, which asserts PayPal holds it. The model would have put the claim back.
That line gets conditioned on the same field.

### What ships meanwhile
The weakest sentence that is true in all three cases at once, because without
the field the prose cannot tell them apart:

> Tamper check: the N stored timeline events are hash-chained and reproduce the
> hash recorded with this payment, HASH, so an edit to them would break the
> chain. Whether PayPal's own copy of that hash matches has not been checked
> for this pack.

True when PayPal holds it and we did not look, true when PayPal holds nothing,
and true but understated when PayPal holds it and it matches. Understated is the
right direction to fail in. It is marked as a deliberate interim in a comment
naming the three cases.

### The alternatives
- **(a) The field, as above.** Restores the strongest true claim the product makes, which is the one a judge should remember: PayPal's own record holds our hash and we read it back and it matched. Half a day including the prose and the prompt.
- **(b) Keep the interim forever.** No contract change. Cost: on the one deal where we can prove PayPal corroborates the history, we say we have not checked. That is the signature proof of the product, understated on purpose, and a judge reading the pack would have no idea it was available.
- **(c) Move the tamper sentence into apps/web, which knows all three.** No contract change, but it splits the pack's prose across two packages and puts product reasoning into the view layer, which is the thing the module rules exist to prevent.

**Recommendation: (a).** (b) is honest but throws away the proof; (c) buys the same outcome by breaking the architecture.

---

## Change 2: `serialSource`, so both ends stop deriving provenance separately

### The finding
`packages/agents/src/buyer/arrival.ts:139` said *"Serial AJ164952580 confirmed
on the item itself"* on the seeded clean deal in demo-only mode, which is what
the e2e suite and the public demo both pin. The number came from the buyer's
caption, and the pal's own `couldNotVerify` on the same page said *"I did not
read the photo file itself"*. Disclosing in one sentence and claiming
confirmation in the next is worse than either alone. `buyer-pal.test.ts:441`
asserted the overclaim, so a test was holding it in place; that assertion has
been corrected with a dated note saying the expectation was wrong rather than
the code.

That half is **fixed and shipping**. The pal now says the serial came from the
description filed with the photo, not from the picture, and that it is the
buyer's word rather than a number it read.

### Why v1.7.0 cannot hold the rest
`apps/web/lib/deal/status-view.ts:480` renders the same claim from
`ArrivalCheck.observed.serial`, which carries no provenance. So the status view
repeated the overclaim with the caveat stripped. apps/web cannot tell the cases
apart from the contract, which means agents and web each have to decide
separately, which is how they drifted in the first place.

### The change
One optional field inside `observed` on `ArrivalCheckSchema`:

```ts
/** Where `serial` came from: read off the picture, or taken from the description filed with it. */
serialSource?: "photo" | "description" | null;
```

Set once where the check is built, from `PhotoReading.source`, which the reading
already carries. Read by both ends.

### What it drags with it
Nothing. **No migration**, same jsonb path as the verdict. Optional. Two
production construction sites. The agents package already has the value
internally and is only prevented from publishing it.

### What ships meanwhile
builder-web drops the provenance clause from the status view rather than
guessing, with a comment saying it is deliberately absent and naming this
proposed field. The provenance still appears on the same page in the pal's
reasons, which now state it properly, so nothing is lost to a reader. An
understated status line beside an accurate reason block is fine; the finding was
a status line contradicting the reason block two rows above it.

### The alternatives
- **(a) The field.** One value, one source of truth, both ends read it. No migration, no risk.
- **(b) Leave the status view silent forever.** No contract change. Cost: the signature view says less than it could about the one thing it exists to be precise about, and the next person will add the clause back because the field looks derivable.

**Recommendation: (a).** This is the cheapest change in either proposal and it closes a drift class rather than a single line.

---

## If you approve

Version becomes **v1.8.0**, both changes together, since they are the same
pattern. I post it to `WORKLOG.md`, bump the contracts section of `PLAN.md`, and
re-brief builder-agents (populate both, restore the strong tamper sentence,
condition the prompt) and builder-web (render anchoring from the pack's own
value, restore the provenance clause from the field).

Approving Change 2 alone is sensible if you want the cheap one now; Change 1
alone makes no sense without it, since they are the same lesson. Declining both
leaves two honest, understated sentences on the site and nothing false, which is
a real option and not a bad one.
