# Pay Pals: read this first

**Project:** Pay Pals, an entry in the PayPal AI Hackathon (Devpost).
**Deadline:** Thu Nov 12, 2026, 12:00 PM Pacific (3:00 PM Eastern). Target: submit Wed Nov 11.
**What it is:** two AI agents, one per side of a stranger deal. The Buyer Pal vets the listing. The Seller Pal locks the exact item into a PayPal Goods & Services checkout payment. Both keep proof until it arrives. See `PRODUCT.md`.

**Read in this order, every session:**
1. This file.
2. `coordination/WORKING_AGREEMENT.md` (batches, stop rules).
3. `coordination/PLAN.md` (module map, contracts, lane assignments, schedule).
4. `coordination/REQUEST.md` (the product request).
5. New lines in `coordination/WORKLOG.md`, open items in `coordination/BLOCKERS.md` and `coordination/REVIEW.md`.

**Hard rules for this repo:**
- PayPal sandbox only. Never put live credentials anywhere. Secrets live in `.env.local` at the main checkout root, never committed.
- The repo goes public at submission. Write every commit, comment and doc as if a PayPal judge is reading it.
- Real brand and product names are fine in demo data, UI and video (Matt's call, Oct 7: e.g. Garmin Fenix 7 stays). Do not copy other companies' logos or artwork. PayPal and Venmo branding is fine; PayPal is the sponsor.
- Matt's writing rules for all user-facing copy and docs: plain words, no em dashes, no marketing voice.

---

## 1. How this repo is built: one Lead, many subagents

Matt runs **one** Claude Code session, in the main checkout (`~/Projects/pay-pals`). That session is the **Lead**. The Lead does not ask Matt to open more windows. It delegates.

| Who | Where defined | Owns |
|---|---|---|
| **Lead** (this session) | this file | `packages/contracts`, `packages/db/schema.ts`, `coordination/`, `docs/adr/`, merging to `main`, deploy, `CHANGELOG.md`, the Devpost checklist. Architect and Integrator in one. Writes no feature code inside a lane's module. |
| `builder-agents` | `.claude/agents/builder-agents.md` | `packages/agents` |
| `builder-paypal` | `.claude/agents/builder-paypal.md` | `packages/paypal`, `packages/db` (not the schema), Lane 0 gate test |
| `builder-web` | `.claude/agents/builder-web.md` | `apps/web` |
| `qa` | `.claude/agents/qa.md` | `tests/integration`, `tests/e2e` |
| `reality-check` | `.claude/agents/reality-check.md` | Read-only. Proves a "done" claim by running it. |
| `blast-radius` | `.claude/agents/blast-radius.md` | Read-only. Lists every consumer before a contract or schema change. |

## 2. How the Lead delegates

1. **Contracts first, alone.** The Lead writes `packages/contracts` and `packages/db/schema.ts` plus the three scenario fixtures before any builder starts. Everything else builds against them.
2. **Fan out in parallel.** For each batch, the Lead launches every independent lane **in a single message**, one Agent call per lane, `subagent_type` set to the lane name and **`isolation: "worktree"`** so each builder works in its own git worktree and branch. Never run independent lanes one after another.
3. **Each delegation prompt states:** the batch (what to build), the contract version it builds against, what done means (from PLAN.md), the stop rules, and the absolute path of `.env.local` in the main checkout so the builder can copy it into its worktree.
4. **When a builder returns,** the Lead reads its report, reviews the diff, runs the tests itself, and calls `reality-check` before anything is called done. Then the Lead merges that branch into `main`, appends to `WORKLOG.md`, and updates the status table in `PLAN.md`.
5. **Conflicts and contract changes** go through the Lead. Before any contract or schema change, the Lead runs `blast-radius`, posts the change to `WORKLOG.md`, and re-briefs the affected lanes.
6. **Continuity.** If a builder needs follow-up on the same work, the Lead continues that agent rather than starting a fresh one, so it keeps its context.

## 3. When the Lead stops and asks Matt

Exactly the stop rules in `coordination/WORKING_AGREEMENT.md`: a schema change after the freeze, a product decision, anything touching real money or irreversible, or a discovery that invalidates the batch. Plus the Lane 0 gate result if the personal-account payee fails.

When it stops, it gives Matt the decision, a recommendation, and the consequence of each option, finishes whatever else is unblocked, and waits. It does not ask permission to continue routine work.

## 4. The test gate

Nothing merges to `main` with a red suite. Before every merge the Lead runs:
```bash
npm test
```
and, from Phase 3 on, the Playwright e2e suite. A builder's own "tests pass" is not enough; the Lead re-runs them on the merged result.

## 5. Modularity rules (non-negotiable)

These are the rules that keep the codebase from turning into the "thousands
and thousands of lines" mess you're trying to avoid. Every agent enforces
these on itself and calls it out in `REVIEW.md` when it sees a violation in
someone else's module.

1. **A file does one thing.** If you can't describe a file's job in one
   sentence without "and," split it.
2. **A module talks to another module only through its published interface**,
   never by reaching into its internals. If one lane needs something from
   another lane's module that isn't exposed, that's a `WORKLOG.md` post and a
   `PLAN.md` revision, not a direct edit.
3. **No file over roughly 300-400 lines without a specific justification
   written in a comment at the top of the file.** This is a smell threshold,
   not a hard law, but it should trigger a "should this split?" conversation.
4. **Every module ships with its own tests in the same phase it's built, not
   after.** A module without tests is not considered done, regardless of
   whether it "works."
5. **Interfaces are versioned in `PLAN.md`.** If a contract changes mid-build,
   that's a worklog post to every agent who depends on it, immediately.
6. **Dead code and abandoned approaches get deleted, not commented out.** Git
   history is the record, not a graveyard of commented blocks in the file.

## 6. Phases and dates

| Dates | Phase | Gate |
|---|---|---|
| Wed Oct 7 to Fri Oct 9 | Contracts + Lane 0 | Lane 0 result in. Contracts, schema and fixtures frozen Fri Oct 9. |
| Sat Oct 10 to Fri Oct 23 | Build (parallel lanes) | Sat Oct 17: scenario 2 end to end on fixtures. Fri Oct 23: all three on real sandbox. |
| Sat Oct 24 to Sun Nov 1 | Review and harden | REVIEW.md empty, e2e green, deployed. **Feature freeze Sun Nov 1.** |
| Mon Nov 2 to Sun Nov 8 | Video week | Build does not slip into this week. |
| Mon Nov 9 to Wed Nov 11 | Buffer | Fixes only. **Submit Wed Nov 11.** |
