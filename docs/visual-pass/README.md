# Visual pass, Oct 8 and 9

Merged to main (ee70456) and deployed on Oct 9. The after screenshots were taken from the preview, which was the same code.

**Preview:** https://pay-pals-git-visual-m00n1.vercel.app (rebuilds on every push to the branch)
**Production, for comparison:** https://pay-pals-m00n1.vercel.app

## Screenshots

`before/` is production before the pass. `after/` is the preview. Same twelve shots in each, desktop at 1280 and phone at 390.

| Page | Before | After |
|---|---|---|
| Landing, desktop | before/landing-1280.png | after/landing-1280.png |
| Landing, phone | before/landing-390.png | after/landing-390.png |
| Fake slab room, desktop | before/fake-slab-room-1280.png | after/fake-slab-room-1280.png |
| Fake slab room, phone | before/fake-slab-room-390.png | after/fake-slab-room-390.png |
| Clean PS5 room, desktop | before/clean-ps5-room-1280.png | after/clean-ps5-room-1280.png |
| Clean PS5 room, phone | before/clean-ps5-room-390.png | after/clean-ps5-room-390.png |
| Empty box room, desktop | before/empty-box-room-1280.png | after/empty-box-room-1280.png |
| Empty box room, phone | before/empty-box-room-390.png | after/empty-box-room-390.png |
| Clean PS5 evidence, desktop | before/clean-ps5-evidence-1280.png | after/clean-ps5-evidence-1280.png |
| Clean PS5 evidence, phone | before/clean-ps5-evidence-390.png | after/clean-ps5-evidence-390.png |
| Empty box evidence, desktop | before/empty-box-evidence-1280.png | after/empty-box-evidence-1280.png |
| Empty box evidence, phone | before/empty-box-evidence-390.png | after/empty-box-evidence-390.png |

The room shots had to be captured at a reduced device scale to stay under 400 KB, so their text is softer than the landing shots. The live preview is sharp.

## What changed

- The two Pals carry the landing page: the hero above the fold beside "Two AI agents. One safe deal.", and cropped avatars of each Pal wherever that Pal speaks (verdict, flag cards, private pal panes, shared chat, timeline, landing steps, scenario cards).
- One colour token file: buyer blue, seller gold, stop red, caution amber, go green, light and dark, with the measured contrast ratios recorded in the file.
- A seven step progress stepper on every deal page: Invited, Card built, Reviewed, Agreed and locked, Paid, Shipped, Arrived, with blocked, issue and cancelled shown as a terminal badge in the stepper.
- The Buyer Pal's Stop, Go or Caution is the dominant block on a review, with the Pal beside it.
- The locked item card reads like a receipt, with a lock state, the version, and an "On the PayPal order" block in monospace.
- Side by side comparisons for the cert check (card says against the grader's record) and the arrival check (locked card against what arrived), mismatched rows in the stop colour.
- A round seal for the history check, green when the stored events reproduce the hash on the PayPal order, red on a mismatch.
- Scenario cards carry their outcome: blocked shield, green check, open issue.
- Short motion on the card lock, the current step and the flag reveal, off under reduced motion.
- Phone first: no horizontal scroll, 16 px gutters, 44 px tap targets.

## Judge read of the preview, on a phone

A read-only pass by the reality-check agent, playing a judge who has never seen the product. Its one word verdict was **fine**: one genuinely memorable screen, the cert comparison table, inside a demo that keeps saying its own photos are missing.

What it would cost us with a judge, worst first:

1. **No photos exist.** Every photo slot is an empty box with caption text, because `assets/demo-photos` is empty. The pitch is that the pals read serials off photos. This is the single biggest hole and only Matt can close it. See `assets/demo-photos/SHOTLIST.md`.
2. **Pal verdicts opened by apologising for it** ("4 of the 4 card photos could not be loaded"). Fixed on the branch: on the hosted site the pals no longer mention photo loading. The seeded demo deals still carry the old text until they are re-seeded, which needs Matt's approval because production shares the database.
3. **The clean deal shows Caution, not Go**, for the same reason, while its own timeline says the review was "go". Photos fix this too.
4. "See the finished deal" read as a caption, not a button. Fixed.
5. Raw markdown and prompt text leaked into the evidence pack. Fixed.
6. The review's forty second wait was a frozen button. Fixed with a staged status line.
7. The stepper was clipped at phone width. Fixed.
8. The evidence page's empty state had no header or way back. Fixed.
9. Event counts disagreed between a deal and its pack. Fixed.
10. Dark mode had a muddy caution panel, low contrast chips and a white hero slab. Fixed.
11. The seller join page had no Seller Pal, a label collision and a refusal box that looked unfinished. Fixed.

## Decisions, Oct 9

- Price panel: show the count and the prices only, no retailer names, keeping "via Channel3" visible. Decided, not yet built.
- Hero: keep the PayPal badges as supplied.
- Re-seeding the demo deals: approved, to run only after the merge to main is approved.

The after screenshots in this folder were captured before the judge-read fixes landed. The preview link above is current; the after files are refreshed on Matt's word.

## g17-night and g17-day (2026-10-11, qa)

Matt's G17 gate on the theme: the landing, one deal room and the evidence
pack, at 1280 and 390, in both colour modes. Taken from `day-night-rebase`
on a demo-only server, so the pal prose is the keyless wording and the
three deals are the seeded ones; nothing here depends on a live model.

The deal room is the **empty box**. It carries the most: all three status
labels, both halves of the payment panel, a shipment with a caution flag on
it, a failed arrival check with the side-by-side comparison, and the only
built evidence pack of the three. What it does not show is the clean deal's
before-and-after review panel and a passing arrival badge.

Day is reached the way a visitor reaches it, by the stored choice
(`pay-pals-theme=light`) written before the page loads, so the boot script
applies it before the first paint. Not Playwright's `colorScheme`: since
G16 nothing in apps/web reads the device, so that setting changes nothing.
Each shot is checked against the `data-theme` the page actually painted
before the file is written.

**What changes between the two sets, measured rather than eyeballed.** Panel
interiors do not change at all: the four panels of the deal room diff at
0.0 to 0.2 percent between modes, the 0.2 being antialiasing. The boxes are
navy in both modes by design. What changes is the page behind them, so the
answer depends on how much of a page is box:

| Page | 1280 | 390 |
|---|---|---|
| Landing | 61.0% of pixels | 37.5% |
| Deal room (empty box) | 37.6% | 10.3% |
| Deal room (clean deal) | 37.3% | 10.4% |
| Evidence pack | 97.6% | 95.9% |
