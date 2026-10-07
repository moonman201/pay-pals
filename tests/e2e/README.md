# tests/e2e

Playwright runs of the three demo scenarios (scam stopped, clean deal paid in the PayPal sandbox, wrong item with an evidence pack) against `apps/web`.

**Not part of the root `npm test`.** The root test gate runs `tests/integration` only. This workspace has no `test` script on purpose, so `npm test --workspaces` skips it. Run it with:

```bash
npm run e2e:install -w tests/e2e   # once, downloads Chromium
npm run test:e2e                   # from the repo root
```

The config starts `apps/web` on port 3100 with no keys (override with `E2E_PORT`). To run against a server you already started, or the deployed app, set `E2E_BASE_URL`. When `apps/web` is not on the branch the specs skip themselves.

Do not run `npm run build` and the e2e at the same time: both use `apps/web/.next`.

## Specs

| File | What it proves |
|---|---|
| `src/landing.spec.ts` | The landing page loads and names all three scenarios. |
| `src/clean-deal-start.spec.ts` | Picking the clean deal as buyer opens a fresh deal room that reads Listed. |

Selectors use roles and visible text, never class names.
