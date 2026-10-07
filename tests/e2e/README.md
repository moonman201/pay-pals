# tests/e2e

Playwright runs of the three demo scenarios against `apps/web`, on fixtures, with no keys. Scam stopped, clean deal paid with the demo buttons, wrong item with an evidence pack, plus a phone-width pass.

**Not part of the root `npm test`.** The root test gate runs `tests/integration` only. This workspace has no `test` script on purpose, so `npm test --workspaces` skips it. Run it with:

```bash
npm run e2e:install -w tests/e2e   # once, downloads Chromium
npm run test:e2e                   # from the repo root
```

The config starts `apps/web` on port 3100 (override with `E2E_PORT`) and reuses a server already on that port. To run against a server you started yourself, or the deployed app, set `E2E_BASE_URL`. When `apps/web` is not on the branch the specs skip themselves.

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
| `src/clean-deal.spec.ts` | Listed to Complete as the buyer and the seller: review, agree and lock, demo pay, ship with checklist and tracking, deliver, arrival matches, complete. |
| `src/wrong-item.spec.ts` | Same path to Delivered, then the serial mismatch, the issue, and the evidence page with the locked card and the arrival photos. |
| `src/phone-width.spec.ts` | The clean deal again at 390 px: no horizontal scroll on the landing page, the deal room or the evidence pack. |

`src/helpers.ts` holds the page helpers and `src/flows.ts` the shared steps. Selectors are roles and visible text, never class names. Assertions on pal wording stop at flag names and the block sentence, so a real Buyer Pal running rules only passes too.

One thing to know: in dev mode the deal room is visible before React has hydrated it, and a click before that is lost. `waitForHydration` in `helpers.ts` waits for React to own the page's buttons; every helper that opens a room calls it.
