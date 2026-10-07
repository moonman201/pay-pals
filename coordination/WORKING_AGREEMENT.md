# WORKING_AGREEMENT.md

**Status: governing. How Matt and Claude work on Pay Pals.** Same agreement as Zirkl.

## 1. Batches, not steps
Default instruction shape:
> Build X through Y. Commit each. Stop if a decision would change the schema or the product.

Claude works the whole batch without checking in.

**What earns a stop, mid-batch:**
- A schema change after the schema freeze (Fri Oct 9).
- A product decision. What the pals are allowed to block, what a buyer can override, what goes in front of a judge. These are Matt's.
- Anything irreversible or touching real money. This repo is sandbox only.
- A discovery that invalidates the batch.

**What does not earn a stop:** naming, file layout, which library, test structure, error codes. Decide, say so in the commit message, keep moving.

**Stopping means stopping, not asking permission to continue.** Surface the decision with a recommendation and the consequence of each branch, finish whatever else is unblocked, and wait.

## 2. One session, many agents
Matt runs one Claude Code session in `~/Projects/pay-pals`. That session is the Lead. When work has independent pieces, the Lead does not build them serially: it launches the lane subagents in `.claude/agents/` in parallel, each in its own worktree, then reviews, tests and merges. Each lane's boundary, contract, done criteria and ordering are in `PLAN.md`. Matt approves gates and makes product calls; he does not manage windows.

## 3. Deadline discipline
- Feature freeze Sun Nov 1. After that, fixes only.
- Video week Nov 2 to Nov 8 belongs to the video. Build does not slip into it.
- Submit Wed Nov 11. The real deadline is Thu Nov 12, 3:00 PM Eastern.
