# Overnight pass: the three finished deal rooms

Full-page screenshots of each finished deal room, once as the buyer and once as the seller, at 1280 px and 390 px wide. Night mode, which is what every visitor gets until they press the toggle.

- Date: 2026-10-13
- Commit: all 12 shots were taken from one tree, main at `802fc33`.
- Environment: the e2e suite's own pinned dev server (`E2E_SERVER_ENV` in `tests/e2e/src/env.ts`) on port 3241. Demo-only mode, memory store, no Claude, Channel3, PSA or PayPal keys.
- Seeded verdicts in this environment come from the rules, not the live model. The pal's words in these shots are the rule-based wording, so they can differ from what the live model writes on the deployed site.
- Every shot is at device scale 1, so a 1280 px shot is 1280 px wide. The files are large (0.5 to 1.5 MB each) because of that.

## The files

| Deal | Buyer | Seller |
|---|---|---|
| Fake slab (scam stopped) | `fake-slab-buyer-1280.png`, `fake-slab-buyer-390.png` | `fake-slab-seller-1280.png`, `fake-slab-seller-390.png` |
| Clean PS5 (paid) | `clean-ps5-buyer-1280.png`, `clean-ps5-buyer-390.png` | `clean-ps5-seller-1280.png`, `clean-ps5-seller-390.png` |
| Empty box (evidence pack) | `empty-box-buyer-1280.png`, `empty-box-buyer-390.png` | `empty-box-seller-1280.png`, `empty-box-seller-390.png` |

## How to retake them

From `tests/e2e`, with a server running on the pinned env:

```
E2E_BASE_URL=http://localhost:3241 npx tsx src/visual-pass.capture.ts overnight dark "" roles full
```
