# WORKLOG.md

Append-only. Format: `[YYYY-MM-DD HH:MM] role: what you found. Affects: who.`

[2026-10-06 21:30] matt+claude: Repo scaffolded. PLAN.md has lane assignments. Phase 1 (Explore) starts on first session in each worktree.
[2026-10-06 21:45] matt+claude: Switched to one Lead session delegating to lane subagents in .claude/agents (parallel, worktree isolation). Six manual worktree windows retired.
[2026-10-07 00:30] matt: Real brand names are fine in demo data, UI and video (Garmin Fenix 7 stays). No copied logos.
[2026-10-06 23:30] lead: Contracts v1.0.0-draft, db schema and three scenario fixtures on main. Import with `import { ... } from "@pay-pals/contracts"`, fixtures via `ALL_FIXTURES` or `getFixture(id)`. Build and 24 tests green. Affects: all lanes.
[2026-10-06 23:30] lead: Matt decided the open product questions. Buyers can override caution flags, never payment-method flags (`PAYMENT_METHOD_FLAGS` in contracts). Either side can start a deal. No sign-up in v1. See PLAN.md Decisions. Affects: builder-agents, builder-web.
[2026-10-06 23:30] lead: Fixture photo URLs are placeholders under /fixtures/<scenario>/. Real demo photos are not in the repo yet. Needed before vision tests and the video. Must be our own shots or renders. Affects: builder-agents, builder-web, Matt.
[2026-10-06 23:30] lead: Packages export TypeScript source, not dist (ADR 0001). apps/web must list `@pay-pals/*` in `transpilePackages`. Affects: builder-web.
