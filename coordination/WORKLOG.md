# WORKLOG.md

Append-only. Format: `[YYYY-MM-DD HH:MM] role: what you found. Affects: who.`

[2026-10-06 21:30] matt+claude: Repo scaffolded. PLAN.md has lane assignments. Phase 1 (Explore) starts on first session in each worktree.
[2026-10-06 21:45] matt+claude: Switched to one Lead session delegating to lane subagents in .claude/agents (parallel, worktree isolation). Six manual worktree windows retired.
[2026-10-07 00:30] matt: Real brand names are fine in demo data, UI and video (Garmin Fenix 7 stays). No copied logos.
[2026-10-06 23:30] lead: Contracts v1.0.0-draft, db schema and three scenario fixtures on main. Import with `import { ... } from "@pay-pals/contracts"`, fixtures via `ALL_FIXTURES` or `getFixture(id)`. Build and 24 tests green. Affects: all lanes.
[2026-10-06 23:30] lead: Matt decided the open product questions. Buyers can override caution flags, never payment-method flags (`PAYMENT_METHOD_FLAGS` in contracts). Either side can start a deal. No sign-up in v1. See PLAN.md Decisions. Affects: builder-agents, builder-web.
[2026-10-06 23:30] lead: Fixture photo URLs are placeholders under /fixtures/<scenario>/. Real demo photos are not in the repo yet. Needed before vision tests and the video. Must be our own shots or renders. Affects: builder-agents, builder-web, Matt.
[2026-10-06 23:30] lead: Packages export TypeScript source, not dist (ADR 0001). apps/web must list `@pay-pals/*` in `transpilePackages`. Affects: builder-web.
[2026-10-06 23:55] builder-agents: packages/agents lands on branch worktree-agent-a37cfc8e780daa09b. apps/web imports from "@pay-pals/agents": createBuyerPal({ anthropic, priceLookup, fetchImage? }), createSellerPal({ anthropic, fetchImage? }), buildEvidencePack(input, { anthropic }) or createEvidencePackBuilder({ anthropic }), createChannel3PriceLookup(apiKey) for real prices, createFixturePriceLookup() for demo mode, createAnthropicClientFromEnv() which returns null without ANTHROPIC_API_KEY (pals then run rules only). review(card, chat, { seller: deal.seller }) takes an optional third argument so the NAME_MISMATCH rule can run; pass it. buildCard throws MissingPriceError when the listing names no price and applyRequest throws CardLockedError on a locked card. Fixture photo URLs are not fetchable, so vision falls back to the photo descriptions and says so in the pal message. Affects: builder-web, qa.
