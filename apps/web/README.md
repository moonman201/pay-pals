# apps/web

The Pay Pals web app. Next.js App Router, Tailwind, Vitest with React Testing Library.

## Run it

```bash
npm install
npm run dev -w apps/web      # http://localhost:3000
npm test -w apps/web
npm run build -w apps/web
```

No keys are needed. Without `NEXT_PUBLIC_PAYPAL_CLIENT_ID` the pay step shows clearly labelled demo buttons that run the same server routes against a mock gateway.

## Where things are

| Path | Job |
|---|---|
| `lib/services.ts` | The one place that picks implementations of `DealStore`, `SellerPal`, `BuyerPal`, `PayPalGateway` and the evidence builder. Swap the mocks for the real packages here and nowhere else. |
| `lib/mocks/` | Fixture-backed implementations of the contract interfaces. Memory store, pals that answer from the scenario fixtures, mock PayPal gateway, evidence builder. |
| `lib/deal/flows/` | One file per step: start, review, card change, agree, pay, ship, arrival, evidence, close, chat. Called by the API routes. |
| `lib/deal/actions.ts` | Maps action-bar buttons to states; whether a button shows comes from `DEAL_TRANSITIONS` in the contracts. |
| `lib/deal/override.ts` | The override rule: caution flags can be overridden, payment-method flags cannot. |
| `app/api/deals/[id]/*` | One route per step. Bodies are validated with Zod. |
| `components/deal/` | The deal room: item card, verdict, action bar, pal pane, shared chat, timeline, step forms. |
| `components/pay/` | PayPal and Venmo buttons on the JS SDK v6, and the demo placeholder. |
| `public/fixtures/` | Demo photos go here (not in the repo yet). Missing files render a neutral placeholder. |

## Views

- `/` demo landing: pick a scenario, play as buyer or seller.
- `/deals/new` start a deal as either side.
- `/deals/[id]?as=buyer|seller` the deal room. Blue for the buyer, gold for the seller.
- `/deals/[id]/evidence?as=buyer|seller` the printable evidence pack.
