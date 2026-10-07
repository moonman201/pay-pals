# Deploying Pay Pals

Vercel for the app, Neon for Postgres. PayPal sandbox only.

## Vercel project settings
- Import the GitHub repo `moonman201/pay-pals`.
- Framework: Next.js. **Root Directory: `apps/web`.** Leave "Include source files outside of the Root Directory" on (default), the app imports workspace packages from `packages/*`.
- Install Command: `npm install` (runs at the repo root because of the lockfile there). Build Command: default (`next build`). Node 22.
- `apps/web/next.config.ts` already sets `outputFileTracingRoot` to the repo root and transpiles the workspace packages.

## Environment variables (Production and Preview)
Copy the names from `.env.example`. Sandbox values only.

| Name | Note |
|---|---|
| `PAYPAL_ENV` | `sandbox`. The code refuses anything else. |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Sandbox app. |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Same client id. Inlined at build time, so a change needs a redeploy. |
| `PAYPAL_WEBHOOK_ID` | From the sandbox webhook pointed at `https://<host>/api/paypal/webhook` with the three events in PLAN.md. |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Without the key the pals run rules only. |
| `CHANNEL3_API_KEY` | Without it the fixture price ranges are used. |
| `DATABASE_URL` | Neon pooled connection string. The app runs the bundled migrations on first start. Without it the in-memory store is used and demo deals vanish on each cold start. |
| `NEXT_PUBLIC_APP_URL` | The deployed URL. |

Do not set `PAY_PALS_DEMO_ONLY` in production. It is a test knob.

## After the first deploy
1. Open `/` and run the clean scenario as the buyer through to payment. The PayPal button should open the sandbox wallet; approve as the sandbox buyer.
2. Create the sandbox webhook in the PayPal developer dashboard, paste its id into `PAYPAL_WEBHOOK_ID`, redeploy, pay once more and confirm the deal moves to PAID from the webhook (timeline line from `paypal`).
3. Run `npm run migrate -w packages/db` locally against the same `DATABASE_URL` only if the first start logged that migration did not run.

## Render (fallback)
Web service from the repo root. Build `npm install && npm run build -w apps/web`, start `npm run start -w apps/web`, same environment variables.
