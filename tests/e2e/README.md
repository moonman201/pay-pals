# tests/e2e

Playwright runs of the three demo scenarios (scam stopped, clean deal paid in the PayPal sandbox, wrong item with an evidence pack) against `apps/web`.

**Status: skeleton. Not wired into the root `npm test`.** The root test gate runs `tests/integration` only. This workspace has no `test` script on purpose, so `npm test --workspaces` skips it until the three scenario runs exist and are green.

Run by hand:

```bash
npm run e2e:install -w tests/e2e   # once, downloads Chromium
npm run e2e -w tests/e2e
```

The config starts `apps/web` on port 3100 (override with `E2E_PORT`). To run against a server you already started, or the deployed app, set `E2E_BASE_URL`. When `apps/web` is not on the branch the specs skip themselves.
