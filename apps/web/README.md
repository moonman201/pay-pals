# apps/web

The Pay Pals web app. Next.js App Router, Tailwind, Vitest with React Testing Library.

## Run it

```bash
npm install
npm run dev -w apps/web      # http://localhost:3000
npm test -w apps/web
npm run build -w apps/web
```

No keys are needed. The startup log says what each piece is running on:

| Key | Set | Not set |
|---|---|---|
| `DATABASE_URL` | Postgres through `@pay-pals/db`, migrated once at startup | In-memory store from `@pay-pals/db`, seeded with the three finished demo deals |
| `ANTHROPIC_API_KEY` | Pals use Claude for wording and judgment | Pals run their deterministic rules only |
| `CHANNEL3_API_KEY` | Market prices from Channel3 | Fixture price ranges |
| `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET` | Real sandbox orders through `@pay-pals/paypal` | A mock gateway that never leaves the process |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | PayPal and Venmo buttons on the JS SDK v6 | Clearly labelled demo buttons that run the same routes |

Where the keys come from: Next only reads `.env` files inside `apps/web`, so the server also loads `.env.local` from the repo root for server-side keys. `NEXT_PUBLIC_*` values are inlined into the browser bundle at build time and must be in `apps/web/.env.local` or the host's environment. A key in your shell wins over the file; if your shell carries `ANTHROPIC_API_KEY`, the pals will use it.

Demo deals live in server memory and are gone after a restart. In dev the services are kept on `globalThis` across hot reloads, so a change to `lib/services.ts` or the mocks needs a restart.

## Where things are

| Path | Job |
|---|---|
| `lib/services.ts` | The one place that picks implementations of `DealStore`, `SellerPal`, `BuyerPal`, `PayPalGateway` and the evidence builder, and the only production file allowed to import `lib/mocks`. A test enforces that. |
| `lib/demo/seed-fixtures.ts` | Replays each scenario fixture through the store's public interface so the memory store holds the finished demo deals. |
| `lib/mocks/paypal-gateway.ts` | The only mock left: a PayPal gateway for runs with no credentials. |
| `lib/deal/flows/` | One file per step: start, review, card change, agree, pay, ship, arrival, evidence, close, chat. Called by the API routes. |
| `lib/deal/actions.ts` | Maps action-bar buttons to states; whether a button shows comes from `DEAL_TRANSITIONS` in the contracts. |
| `lib/deal/override.ts` | The override rule: caution flags can be overridden, payment-method flags cannot. |
| `lib/deal/issue.ts` | Reasons a buyer can give when opening an issue, by state. |
| `app/api/deals/[id]/*` | One route per step. Bodies are validated with Zod. `GET /api/deals/[id]` returns the snapshot, `GET /api/deals/[id]/evidence` the saved pack. |
| `app/api/paypal/webhook` | Verifies the PayPal signature on the raw body, then hands the event to the package handler. 400 unverified, 500 retry, 200 otherwise. |
| `components/deal/` | The deal room: item card, verdict, action bar, pal pane, shared chat, timeline, step forms. |
| `components/pay/` | PayPal and Venmo wallet buttons on the JS SDK v6 (no card fields: the payee may be a personal account), and the demo placeholder. |
| `public/fixtures/` | Demo photos go here (not in the repo yet). Missing files render a neutral placeholder. |

## Views

- `/` demo landing: pick a scenario, play as buyer or seller, or open a finished example.
- `/deals/new` start a deal as either side.
- `/deals/[id]?as=buyer|seller` the deal room. Blue for the buyer, gold for the seller.
- `/deals/[id]/evidence?as=buyer|seller` the printable evidence pack.
