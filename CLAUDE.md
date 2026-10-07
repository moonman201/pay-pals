# Pay Pals: read this first

**Project:** Pay Pals, an entry in the PayPal AI Hackathon (Devpost).
**Deadline:** Thu Nov 12, 2026, 12:00 PM Pacific (3:00 PM Eastern). Team target: submit Wed Nov 11.
**What it is:** two AI agents, one per side of a stranger deal. The Buyer Pal vets the listing. The Seller Pal locks the exact item into a PayPal Goods & Services checkout payment. Both keep proof until it arrives. See `PRODUCT.md`.

**Read in this order, every session:**
1. This file (the protocol below is how every lane works).
2. `coordination/WORKING_AGREEMENT.md` (batches, stop rules).
3. `coordination/PLAN.md` (module map, contracts, your lane's assignment).
4. `coordination/REQUEST.md` (the product request).
5. New lines in `coordination/WORKLOG.md` and anything in `coordination/BLOCKERS.md` addressed to you.

**Hard rules for this repo:**
- PayPal sandbox only. Never put live credentials anywhere. Secrets live in `.env.local`, never committed.
- The repo will be public at submission. Write every commit, comment and doc as if a PayPal judge is reading it.
- No third-party trademarks in UI, demo data or video (no Facebook, Meta, Reddit, eBay logos or names in the product). Say "online marketplace." PayPal and Venmo branding is fine; PayPal is the sponsor.
- Matt's writing rules apply to all user-facing copy and docs: plain words, no em dashes, no marketing voice.

---

# Multi-Agent Orchestration Protocol (VSCode + Claude Code)

This file is the master script. Every agent working on this repo reads this file
first, in full, before doing anything else. It defines who the agents are, how
they talk to each other, how work gets divided, and the rule that nothing merges
without being tested.

This is adapted from the AgentRadio research protocol (Coral Protocol), stripped
of its research infrastructure (Harbor, Modal, a Java message server) and rebuilt
for a solo founder running multiple Claude Code sessions locally in VSCode. The
idea worth keeping: agents post discoveries the moment they make them instead of
waiting for a checkpoint, and a fixed five-phase protocol stops the team from
freelancing into chaos.

---

## 0. Why this exists

The failure mode you are trying to avoid is a single agent (or a single dev)
writing one more feature into one more file until the file is 3,000 lines and
touching it breaks three other things. The fix is not "write better code." The
fix is structural:

1. **Small, single-purpose modules with explicit contracts.** No file grows
   without a reason. No agent reaches across a module boundary without going
   through its published interface.
2. **Division of labor with a named owner per module.** One agent, one lane.
   Cross-cutting changes go through a negotiation step, not a silent edit.
3. **Continuous testing baked into the loop, not bolted on at the end.** Every
   phase boundary in this protocol has a mandatory test-and-fix gate. Nothing
   advances to the next phase with a red test suite.
4. **A shared radio channel.** Agents broadcast what they find as they find it,
   so a teammate can react mid-task instead of discovering the conflict a day
   later during merge.

---

## 1. The team

Run each of these as a **separate Claude Code session**, in a **separate VSCode
terminal pane**, on a **separate git worktree** branched from the same base.
Worktrees mean every agent has a real, isolated working copy of the repo on
disk, so they can run builds and tests without stepping on each other.

```bash
# From the main repo, one time setup:
git worktree add ../pay-pals-architect architect
git worktree add ../pay-pals-builder-a builder-a
git worktree add ../pay-pals-builder-b builder-b
git worktree add ../pay-pals-builder-c builder-c
git worktree add ../pay-pals-qa qa
git worktree add ../pay-pals-integrator integrator
```

Open six VSCode windows, one per worktree folder, and start `claude` in each.

| Role | Lane | Responsibility |
|---|---|---|
| **Architect** | `/architecture/`, module contracts | Owns the module map, the interfaces between modules, and the ADRs (architecture decision records). Never writes feature code. |
| **Builder-A / Builder-B** | one module each | Implements one module against the contract the Architect defined. Writes unit tests for their own module as they go. Never edits another builder's module directly. |
| **QA** | `/tests/integration/`, `/tests/e2e/` | Writes and runs integration and end-to-end tests across module boundaries. Files bugs against the owning builder. Cannot fix bugs in someone else's module, only report them with reproduction steps. |
| **Integrator** | merge coordination, `CHANGELOG.md` | Reviews diffs before merge, runs the full test suite on the integration branch, resolves cross-module conflicts, and is the only one who merges into `main`. |

Scale this up or down. A small feature might only need Architect + one Builder +
QA. A bigger build might need three Builders. The roles are what matter, not
the headcount.

---

## 2. The radio channel

You don't have a message server, so the channel is a plain file, committed to a
shared branch every agent tracks:

```
/coordination/
  PLAN.md          # the current divide-and-conquer plan, owned by Architect
  WORKLOG.md        # append-only log of discoveries, one line per entry
  BLOCKERS.md       # open questions / conflicts that need another agent's input
  REVIEW.md         # findings from QA and the Integrator, tagged by module
```

**Rules for the channel:**

- Every agent runs `git pull` on the coordination branch at the start of every
  work turn (i.e., before starting a new task, not just once at session start).
- The moment an agent finds something a teammate needs to know — a changed
  interface, a dead end, an assumption that turned out false — it appends a
  line to `WORKLOG.md` and commits immediately. Do not wait until the task is
  "done" to report it. This is the single most important habit from AgentRadio:
  broadcasting mid-task is what gave it a 62% vs 52% task accuracy jump over
  agents that only synced at checkpoints.
- Worklog entries follow this format so they're skimmable:
  ```
  [2026-08-22 14:03] builder-a: Changed `UserRepo.get()` return type to
  `Result<User, Error>` instead of throwing. Affects: builder-b (auth module
  calls this). See PLAN.md#interfaces.
  ```
- If a discovery blocks you, also add a line to `BLOCKERS.md` and keep working
  on something else in your lane while you wait. Do not idle.

At the start of every work turn, each agent should:
1. Pull the coordination branch.
2. Read new `WORKLOG.md` entries since its last turn.
3. Check `BLOCKERS.md` for anything addressed to it.
4. Proceed with its task, folding in anything relevant it just read.

This is the "passive awareness" behavior: you're not blocking to wait for
messages, you're checking the channel at natural boundaries (start of a task,
before a commit, before declaring a phase done) so nothing costs you a full
stop.

---

## 3. The five-phase loop

Every build, feature, or milestone runs through these five phases in order.
Nobody skips ahead. The Integrator is the phase gatekeeper: a phase does not
end until the Integrator has confirmed the exit criteria below.

### Phase 1 — Explore
Every agent independently reads the existing codebase and the request. Nobody
writes code yet. Each agent appends to `WORKLOG.md` what it found: existing
patterns to reuse, risks, open questions. Architect synthesizes this into a
first draft of `PLAN.md`.

**Exit criteria:** `PLAN.md` exists with a first-pass module breakdown.

### Phase 2 — Divide
Architect proposes the module boundaries and the interface contract for each
(inputs, outputs, error handling, what each module is NOT responsible for).
Builders review it against `PLAN.md`, push back in `WORKLOG.md` if a boundary
doesn't make sense, and Architect revises until every Builder and QA has
explicitly written "approved" against the plan.

**Exit criteria:** every agent has posted approval of `PLAN.md` in the worklog.
Do not proceed on a silent lack of objection — require an explicit yes.

### Phase 3 — Execute
Each Builder works its module against the agreed contract. QA writes
integration tests against the contract in parallel, not after the fact, so
tests exist before the implementation is "done" (this catches contract
drift early). The moment a Builder deviates from the agreed contract for a
good reason, it posts that to `WORKLOG.md` immediately, not at the end.

**Test-and-iterate gate, mandatory before this phase can close:**
```bash
# each builder, in its own worktree, before flagging done:
npm test
```
A module is not "done" until its own tests are green. Red tests are not
handed off to QA to find later.

**Exit criteria:** every module's unit tests pass in its own worktree.

### Phase 4 — Review
QA runs integration and end-to-end tests against the merged set of branches on
a scratch integration branch (not `main`). Every failure gets filed in
`REVIEW.md`, tagged with the owning module and reproduction steps. The
Integrator reviews diffs for code smell: files that got too big, logic that
leaked across a module boundary, duplicated logic that should be shared.
Builders fix findings tagged to their module and re-run their own tests before
re-flagging done. This can loop Phase 3 → Phase 4 more than once. That's
expected, not a failure.

**Exit criteria:** `REVIEW.md` has zero open findings, and the full test suite
(unit + integration + end-to-end) is green on the integration branch.

### Phase 5 — Submit
Integrator merges the integration branch into `main`, writes the
`CHANGELOG.md` entry, and tags the module boundaries that shipped. Architect
updates any ADRs that changed during the build. Coordination files
(`WORKLOG.md`, `BLOCKERS.md`, `REVIEW.md`) get archived to
`/coordination/archive/<date>/` and reset empty for the next cycle.

**Exit criteria:** `main` has a green test suite and a changelog entry.

---

## 4. Modularity rules (non-negotiable)

These are the rules that keep the codebase from turning into the "thousands
and thousands of lines" mess you're trying to avoid. Every agent enforces
these on itself and calls it out in `REVIEW.md` when it sees a violation in
someone else's module.

1. **A file does one thing.** If you can't describe a file's job in one
   sentence without "and," split it.
2. **A module talks to another module only through its published interface**,
   never by reaching into its internals. If Builder-A needs something from
   Builder-B's module that isn't exposed, that's a `WORKLOG.md` post and a
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

---

## 5. Continuous self-testing after ship (the "full tech stack staff" behavior)

The team doesn't stop at Phase 5. Set up a recurring loop (a scheduled task, a
cron-triggered Claude Code run, or you kicking it off each morning) that plays
the role of ongoing QA and SRE staff:

1. **Regression watch.** QA agent re-runs the full test suite against `main`
   on a schedule (daily, or on every merge). Any new failure gets filed in
   `REVIEW.md` and routed to the owning module's Builder automatically based
   on `PLAN.md`'s module ownership map.
2. **Drift audit.** Architect agent periodically diffs the actual module
   boundaries in the code against what `PLAN.md` says they should be, and
   flags modules that have grown past their contract.
3. **Self-proposed hardening.** QA agent is allowed to open small, scoped
   worklog entries proposing new test cases for edge cases nobody wrote a
   test for yet, and can hand these to a Builder as small tasks.
4. **Iteration loop for feature growth.** New features re-enter at Phase 1
   (Explore) with the existing `PLAN.md` as context, not a blank slate. This
   is what lets the system grow without every addition re-litigating the
   whole architecture.

This turns the five-phase loop into a standing operating rhythm instead of a
one-time build process, which is the actual thing that replaces "a large team
of engineers" with a small number of coordinated agents.

---

## 6. Starting a new build

To kick off a new feature or app under this protocol, the human (you) does
this:

1. Write the request in plain language in a new file,
   `/coordination/REQUEST.md`.
2. Start the five Claude Code sessions per Section 1, each pointed at this
   `CLAUDE.md` file and told: "Read CLAUDE.md and REQUEST.md, then begin
   Phase 1 in your role."
3. Check in at each phase boundary. The Integrator agent should be the one
   that pings you (via a note in `WORKLOG.md` addressed to you) when a phase
   is ready to close, so you're not babysitting every step, just approving
   gates.

That's the whole loop. Small modules, one owner each, mandatory tests at every
boundary, and a shared file that acts as the radio channel so nobody works
blind.
