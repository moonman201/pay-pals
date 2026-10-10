# Proposed: contracts v1.7.0

Written 2026-10-10 by the Lead, for Matt. **Status: waiting on Matt.** Nothing in
this file is built. Contracts stay frozen at v1.6.0 until Matt says otherwise.

Two items in the Oct 10 batch cannot be built inside v1.6.0. Everything else in
that batch is being built now and needs no decision. `blast-radius` has already
listed every consumer of both changes; the counts below are from that run and I
checked the three that carry the most weight myself.

---

## Change 1, for batch item A: record the off-platform choice

### What item A asks for
Anyone can start a deal and get the full checks no matter how they plan to pay.
If the buyer then chooses to pay outside Goods and Services, Pay Pals says
plainly "You're on your own from here: no PayPal protection and no dispute
path," **records that on the timeline**, and steps back. It never processes a
Friends and Family payment.

### Why v1.6.0 cannot hold it
`DEAL_EVENT_KINDS` in `packages/contracts/src/messages.ts` is a closed enum, and
every timeline line is one of those kinds. There is no kind that means "the
buyer chose to pay outside Goods and Services". Recording it is the part of item
A that the contract blocks; the warning text and the stepping back are ordinary
UI work.

### The change
One value added to `DEAL_EVENT_KINDS`:

```ts
/** The buyer chose to pay outside Goods and Services. Pay Pals warned them and stepped back. */
"off_platform_chosen",
```

No state table change. The deal stays where it is if that is already terminal
(the refusal case ends BLOCKED), and otherwise moves REVIEWED to CANCELLED,
which is already legal. No new red flag code: a seller pushing Friends and
Family already raises `FRIENDS_AND_FAMILY_REQUEST`, and that stays.

### What it drags with it
**This is also a schema change, which is the second thing that earns a stop.**
`packages/db/schema.ts` builds the Postgres enum straight from the contracts
constant, so Postgres needs an `ALTER TYPE`. There is clear precedent: three of
the four existing migrations do exactly this.

| Where | What has to happen |
|---|---|
| `packages/contracts/src/messages.ts` | the one new enum value |
| `packages/db/drizzle/0005_*.sql` | `ALTER TYPE "public"."deal_event_kind" ADD VALUE 'off_platform_chosen' ...` |
| `packages/db/src/postgres/migrations.generated.ts` | re-bundled with `npm run db:bundle -w packages/db`. The production migrator reads only this file, so skipping it means the value never reaches Neon. `migrations.test.ts` fails the gate if it is stale, which is the safety net. |
| `apps/web/lib/labels.ts` | `EVENT_KIND_LABELS` is an exhaustive `Record<DealEventKind, string>` with no fallback. **Without a new entry the apps/web build fails**, which on Vercel shows up as a generic build error. |
| `apps/web/lib/deal/progress.ts` | `reachedFromEvents` ignores unknown kinds, so the stepper would not react. Needs a decision about what the stepper shows for a deal that went off-platform. |
| `apps/web/components/deal/Timeline.tsx` | the dot colour map is `Partial`, so it falls back silently. Cosmetic, but it should get an entry. |
| `apps/web/lib/demo/seed-fixtures.ts` | has a catch-all, so it compiles, but a demo of this path would need a real case. |

Nothing else breaks. The hash chain is unaffected: `hashEvent` treats `kind` as
an opaque string, so existing events keep their hashes and
`historyMatchesHead` still holds.

### The alternatives, and what each costs
- **(a) The new event kind, as above.** The off-platform choice becomes a
  first-class fact: the timeline reads properly, the evidence pack can name it,
  and a judge can see Pay Pals stepping back on the record. Cost: a migration
  on Neon and the five apps/web touch points. Half a day, most of it the
  migration discipline rather than the code.
- **(b) Reuse `state_changed` to CANCELLED with the sentence in the summary.**
  No contract change, no migration, ships today. Cost: the choice is not a fact
  anything can query, so anyone who wants to find it has to string-match a
  summary sentence, which is exactly the kind of thing that rots. Worse, the
  timeline would read "Cancelled" for a deal the buyer is actually going ahead
  with outside Pay Pals. That is misleading, which is the opposite of what
  section D of this batch is for.
- **(c) Show the warning, record nothing.** No change at all. Cost: fails the
  part of item A you actually wrote down, and the audit chain has a hole exactly
  where the money left our path.

**My recommendation: (a).** Item A is a product decision you made, and the
honest version of it needs the event on the record. (b) buys a day and costs us
a misleading timeline on the one path where we are telling the buyer they have
no protection.

---

## Change 2, for batch item C5: the pal's reasons as data

### What item C5 asks for
Every pal decision shows its reasons: what it checked, what it found, what it
could not verify, and what would change its mind.

### Why v1.6.0 cannot hold it
A `Verdict` today carries `flags`, `priceCheck`, `certCheck`,
`questionsForSeller` and one `palMessage` string. "What it checked" and "what it
found" can be derived from those. **"What it could not verify" and "what would
change its mind" exist nowhere.** They are new output and there is no field for
them.

### The change
One optional field on `VerdictSchema` and the same on `ArrivalCheckSchema`:

```ts
export const PalReasoningSchema = z.object({
  checked: z.array(z.string().min(1).max(300)),
  found: z.array(z.string().min(1).max(300)),
  couldNotVerify: z.array(z.string().min(1).max(300)),
  wouldChangeMyMind: z.array(z.string().min(1).max(300)),
});
```

### What it drags with it
Almost nothing, which is why I am comfortable recommending it.
**No migration.** `packages/db/schema.ts` stores a verdict as a single `jsonb`
payload and the mappers write and read the whole object rather than a field
list, so the new field round-trips on both stores untouched. No schema is
`.strict()` anywhere in the repo, so old stored verdicts without the field still
parse. The evidence pack passes verdicts through whole, so the reasons reach the
pack with no change to the builder. Only two places in production code construct
a verdict or arrival check, and the field being optional means neither has to
change until we want to fill it.

The real work is not the contract, it is the agents filling it honestly and the
UI showing it. That is the point of the item.

### The alternatives, and what each costs
- **(a) The optional field, as above.** The four groups are structured, so they
  can be laid out as four labelled groups, tested, and policed by the grounding
  check that already strips ungrounded claims per claim. Additive and safe.
- **(b) Put the reasons in `palMessage` prose.** No contract change, ships
  today. Cost: it is one string, so it cannot be laid out as the four groups you
  asked for, the grounding check cannot police a claim it cannot find, and we
  cannot write a test that the pal said what it could not verify. Section D of
  this batch is about not overclaiming; this is the field that proves we are not.
- **(c) A separate reasoning table keyed by verdict.** Needs a real schema
  change for no benefit over (a), since the payload is already jsonb.

**My recommendation: (a).** It is additive, needs no migration, and C5 and C6
together are the items that make the pals look like agents rather than scripts,
which is a judging criterion.

---

## If you approve

Version becomes **v1.7.0**. I post it to `WORKLOG.md`, re-brief
builder-agents, builder-web and builder-paypal, and bump the contracts section
of `PLAN.md`. Change 1 goes to builder-paypal for the migration and the
re-bundle, then builder-web for the five touch points. Change 2 goes to
builder-agents to fill and builder-web to render.

If you approve Change 2 only, item C5 lands this batch and item A stays parked
with the warning text built but nothing recorded, which I would rather not ship
half of. Tell me and I will park A whole.
