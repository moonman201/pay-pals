# Pay Pals

**Two AI agents. One safe deal.**

Pay Pals puts an AI agent on each side of a stranger deal. The buyer's pal vets the listing, the seller's pal locks the item into a PayPal Goods & Services payment, and both keep proof.

Built for the PayPal AI Hackathon. Runs on the PayPal sandbox.

![Pay Pals](assets/pay-pals-hero.jpg)

## How it works
- **Seller Pal** (gold) turns a listing and photos into an item card: model, serial read from the photos, condition, what is included, price.
- **Buyer Pal** (blue) checks the price against market data (Channel3), reads the chat for scam patterns, asks for what is missing, and gives a plain verdict. Payment-method flags (Friends and Family, off-platform) end the deal; the buyer cannot override them.
- When both sides agree, the card is locked and becomes a PayPal Goods and Services checkout order paid to the seller, with the item details on the order.
- After delivery the Buyer Pal checks what arrived against the locked card. If something is wrong, an evidence pack is built for a PayPal dispute.

Three demo scenarios ship in the app: a scam that gets stopped, a clean deal that completes, and a wrong item that arrives.

## Try it yourself

**https://pay-pals-m00n1.vercel.app** No setup, no sign-up, nothing to install.
Everything runs on the PayPal sandbox, so no real money moves anywhere.

Each scenario card has **Play as buyer** and **Play as seller**, which start a
fresh copy of that deal and run the real pals on it, and **See the finished
deal**, which opens the completed version if you would rather read than click.
Run the three in this order.

### 1. Stolen photo stopped

Play as buyer. Press **Ask my pal to review**. The listing photo was lifted from
someone else's listing, the seller pushes Friends and Family and sets a
deadline, and the Buyer Pal stops the deal. Read the flags: each one quotes what
it is based on. The cert on the slab label is real and matches the card in the
picture, and the pal says what that does and does not show. No money moves, and
Pay Pals will not create the order.

### 2. Clean deal

Play as buyer, then **Ask my pal to review**. The Buyer Pal cannot read the
serial off the wide shot of the console, so it asks for a close-up. Switch to
the seller with the link at the top of the room, add the suggested photo, and
save the new card version. Back as the buyer, review again: the console serial
now matches the box label and the verdict changes. Agree on both sides and the
card locks, which is the moment the card text becomes the PayPal order.

Then pay. This is the step that needs the sandbox test buyer, below.

### 3. Empty box arrives

Play as buyer. The Buyer Pal asks for a photo of the serial on the console and
never gets an answer, and the buyer pays anyway. The seller ships without the
packing photo the checklist asked for. The box arrives with the foam, a plastic
bag and no console, the arrival check finds no console serial, and the evidence
pack names the unanswered question, the missing packing photo and the console
that is not there.

### Signing in as the sandbox test buyer

Scenario 2 reaches a real PayPal checkout, and PayPal needs a buyer to approve
it. Press the PayPal button and a sandbox test account is waiting for you: the
pay panel shows that account's email and password with a copy button, labelled
as a test account. Sign in with it in the PayPal window and approve. Nothing is
charged, the money is sandbox money, and the order is paid to the seller's
sandbox account as the payee.

If the pay panel shows no test account, the host is missing
`SANDBOX_BUYER_EMAIL` and `SANDBOX_BUYER_PASSWORD`. The rest of the scenario
still reads, and **See the finished deal** shows the paid, shipped and matched
ending.

### What to look at while you are in there

- The **item card** says "On the PayPal order" over the exact text that goes into the order. That is the whole idea.
- The **history check** on the deal page and the evidence pack: every event is hash-chained, and the head at payment time is written into the PayPal order's `custom_id`, so PayPal's own record of the order shows the history was not edited after the order was created.
- The **evidence pack** on scenario 3, which is the dispute-ready summary a buyer would attach.

## Run it

Needs Node 22 and npm 10.

```bash
git clone <this repo>
cd pay-pals
npm install
npm run dev -w apps/web      # http://localhost:3000
```

No keys are needed for demo mode. The three scenarios run on fixtures, the pals run their deterministic rules, and the pay step shows labelled demo buttons.

For the real thing, copy `.env.example` to `.env.local` and fill in:

| Key | Gives you |
|---|---|
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Real PayPal sandbox orders and the PayPal and Venmo buttons. Sandbox only; the code refuses anything else. |
| `PAYPAL_WEBHOOK_ID` | Webhook signature verification. |
| `ANTHROPIC_API_KEY` | Claude for both pals. Without it the pals run rules only. |
| `CHANNEL3_API_KEY` | Live market prices. Without it the fixture price ranges are used. |
| `DATABASE_URL` | Postgres (Neon) instead of the in-memory store. |

The hosted demo above runs on the PayPal sandbox with Neon, live Claude and live Channel3. In development for the PayPal AI Hackathon.

## Test it

```bash
SKIP_REAL_TESTS=1 npm test   # every workspace, no network
npm test                     # also runs the sandbox PayPal and Claude tests when keys are present
npm run build
npm run gate -w packages/paypal   # Lane 0: proves a sandbox personal and business payee both get paid
```

## Layout

```
packages/contracts   types, deal state table, interfaces, demo fixtures
packages/agents      Seller Pal, Buyer Pal, red-flag rules, Channel3 client, evidence pack
packages/paypal      PayPal sandbox gateway, webhook handler, Lane 0 gate
packages/db          in-memory and Postgres deal stores, migrations
apps/web             the Next.js app a judge clicks through
tests/               integration and end-to-end suites
coordination/        how this repo was built: plan, working agreement, worklog
docs/adr/            decisions
docs/postman/        the PayPal calls as a Postman collection
```

## License
MIT. See `LICENSE`.
