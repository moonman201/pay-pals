# tests/e2e

Playwright runs of the three demo scenarios against `apps/web`, on fixtures, with no keys. Scam stopped, clean deal paid with the demo buttons, empty box with an evidence pack, plus a phone-width pass.

**Not part of the root `npm test`.** The root test gate runs `tests/integration` only. This workspace has no `test` script on purpose, so `npm test --workspaces` skips it. Run it with:

```bash
npm run e2e:install -w tests/e2e   # once, downloads Chromium
npm run test:e2e                   # from the repo root
```

The config starts `apps/web` on port 3100 (override with `E2E_PORT`) and reuses a server already on that port. When `apps/web` is not on the branch the specs skip themselves.

**The suite always runs in demo-only mode.** The server it starts gets `PAY_PALS_DEMO_ONLY=1`, which forces the memory store, rules-only pals, fixture prices and the mock PayPal gateway no matter what keys the shell or `.env.local` carry. The suite never spends a Claude or PayPal call, and a key in your shell does not change the result.

A real-mode run (real Buyer Pal, real sandbox) is a manual job: start `apps/web` yourself with the keys you want, then point the same specs at it with `E2E_BASE_URL=http://localhost:3000 npm run test:e2e`. The waits after a pal call (review, arrival check) allow 60 s for that; every other wait stays short. Note that a reused server on port 3100 keeps whatever mode it was started in.

Do not run `npm run build` and the e2e at the same time: both use `apps/web/.next`.

## Projects

| Project | Viewport | Runs |
|---|---|---|
| `chromium` | Desktop Chrome | every spec except `phone-width` |
| `phone` | 390 x 844, touch | `phone-width.spec.ts` only |

## Specs

| File | What it proves |
|---|---|
| `src/landing.spec.ts` | The landing page loads and names all three scenarios. |
| `src/scam-stopped.spec.ts` | The review blocks the scam deal: payment-method flag, no Agree button, no override, timeline says why. |
| `src/clean-deal.spec.ts` | Listed to Complete as the buyer and the seller: review, both sides agree and the card locks, demo pay, ship with checklist and tracking, deliver, arrival matches, complete. |
| `src/card-change-reagree.spec.ts` | Buyer agrees, the seller changes the card instead, the deal goes back to Listed, both sides review and agree again, locked at version 2. |
| `src/empty-box.spec.ts` | Same path to Delivered, then the arrival check finds no console to read a serial from, the issue, and the evidence page with the locked card and the arrival photos. |
| `src/phone-width.spec.ts` | The clean deal again at 390 px: no horizontal scroll on the landing page, the deal room or the evidence pack. |

`src/helpers.ts` holds the page helpers and `src/flows.ts` the shared steps. Selectors are roles and visible text, never class names. Assertions on pal wording stop at flag names and the block sentence, so a real Buyer Pal running rules only passes too.

One thing to know: in dev mode the deal room is visible before React has hydrated it, and a click before that is lost. `waitForHydration` in `helpers.ts` waits for React to own the page's buttons; every helper that opens a room calls it.
