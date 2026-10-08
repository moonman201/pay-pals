# Submission checklist

Deadline Thu Nov 12, 2026, 12:00 PM Pacific. Target: submit Wed Nov 11. Facts from the rules are in `HACKATHON.md`.

## Must be true before the video (feature freeze Sun Nov 1)
- [x] Three scenarios run end to end on the real rule engine with no keys (Playwright, every merge).
- [x] Real PayPal sandbox orders paid to the seller payee with the card text on the order (Lane 0, real-mode spec).
- [x] PayPal and Venmo SDK buttons complete a sandbox payment in a browser.
- [x] Claude runs both pals; Channel3 answers the price check live.
- [x] Postgres on Neon, migrations bundled, state survives restarts.
- [x] Two-sided agreement; payment-method flags are a hard block; other flags overridable with a warning.
- [x] Buyer-first entry with a seller invite; a refusal is the strongest stop.
- [x] PSA cert check for graded items (live call pending `PSA_API_TOKEN`).
- [x] Tamper-evident history: hash chain anchored in the PayPal order, verified on the evidence page.
- [ ] Demo photos in `assets/demo-photos` (PS5 and the slab) and the real console serial in the fixtures (Matt).
- [ ] `PSA_API_TOKEN` in `.env.local`, then one live PSA call to confirm the response shape (Matt, then Lead).
- [ ] `ANTHROPIC_API_KEY` rotated after the Oct 7 transcript exposure (Matt).
- [x] Hosted on Vercel: https://pay-pals-m00n1.vercel.app opens with no setup, runs on Neon, live Claude and Channel3, sandbox PayPal (Oct 8).
- [ ] Sandbox webhook created and `PAYPAL_WEBHOOK_ID` set; a real capture moves a deal to PAID through the webhook (Lead).
- [ ] Contracts frozen Fri Oct 9: bump `packages/contracts` from 1.4.0-draft to 1.4.0 (Lead).
- [ ] A judge-facing walkthrough on the landing page: which scenario to click first, which side to play.

## Repo (public at submission)
- [x] MIT license.
- [x] README with setup, test and layout sections.
- [ ] Re-read every user-facing string and doc for the writing rules: plain words, no em dashes, no marketing voice.
- [ ] Confirm no third-party trademarks beyond PayPal, Venmo and the product names in the demo data; no copied logos or artwork.
- [ ] Secret scan on the final tree (`git grep` for key shapes; only `.env.example` among env files).
- [ ] Flip the repo to public.

## Devpost (Matt)
- [ ] YouTube video under 3 minutes showing the three scenarios on the hosted link, sandbox payment included.
- [ ] Hosted URL and repo URL.
- [ ] Write-up: problem, what the pals do, why PayPal cares, what is real (sandbox orders, Claude, Channel3, Neon).
- [ ] Elevator pitch.
- [ ] Sponsor prize entry: Channel3 (one sponsor prize allowed).

## Last day (Wed Nov 11)
- [ ] Fresh clone, `npm install`, `SKIP_REAL_TESTS=1 npm test`, `npm run test:e2e`: all green.
- [ ] Open the hosted link in a private window and run all three scenarios as a judge would.
- [ ] Submit.
