# Demo photos

These are real photos of the project owner's own PlayStation 5 and his own graded card. They were shot on a phone as HEIC, converted to JPEG, resized to 2400 px and stripped of every metadata tag with exiftool. The originals carried GPS coordinates; the committed files carry none. The HEIC originals are gitignored and are not in the repo.

The copy script in `apps/web/scripts/copy-demo-photos.mjs` copies this folder into `apps/web/public/fixtures`, so the paths below are also the paths the fixtures use.

## What is in the repo, and what each pal reads from it

| File | Shot | What the pal reads |
|---|---|---|
| `clean-ps5/console-back.jpg` | The whole back of the console, flat on. | Model `CFI-1015A`, Sony PlayStation 5, manufactured February 2021. The serial sticker is in frame but far too small to trust, which is the point of the scenario. |
| `clean-ps5/console-serial-closeup.jpg` | Close-up of the sticker on the back, barcode filling most of the frame. | Serial `AJ164952580` on the item itself. This is the photo the Buyer Pal asks for. |
| `clean-ps5/box-label.jpg` | The registration label on the torn-open box. | Serial `AJ164952580` on the box label. A box label never satisfies the item serial on its own. |
| `clean-ps5/everything-included.jpg` | Everything laid out: console, blue controller, HDMI, power and USB cables, stand. | What is included, which becomes the card's included list. |
| `clean-ps5/packing-in-box.jpg` | The accessories going into the shipping box. | The required packing photo. Its absence is what the empty box scenario turns on. |
| `clean-ps5/packing-sealed.jpg` | The shipping box taped shut, no carrier label. | The sealed-box photo. Tracking is typed in, not photographed. |
| `clean-ps5/arrival-console-serial.jpg` | The same close-up, as the buyer's arrival photo. | Serial `AJ164952580` on arrival, compared against the locked card. |
| `empty-box/console-back.jpg` | Same shot as the clean deal. | Same model, same unreadable sticker. |
| `empty-box/box-label.jpg` | Same label shot. | Serial `AJ164952580` on the box. |
| `empty-box/packing-sealed.jpg` | The sealed box. | The only packing photo this seller provides. |
| `empty-box/arrival-box-open-empty.jpg` | The box opened on arrival: two foam inserts and a crumpled plastic bag, nothing between them. | No console, so no serial on any item. That is the mismatch. |
| `empty-box/arrival-box-label.jpg` | The label on the box that arrived. | Serial `AJ164952580` on the box, which still does not prove a console was inside. |
| `fake-slab/slab-front.jpg` | The graded card, front, on a wooden table. | Label line by line: `2018 P.M. JPN. SUN & MOON #038`, `GENGAR & MIMIKYU GX`, `TAG BOLT`, `GEM MT 10`, cert `72096346`. |
| `fake-slab/slab-back.jpg` | The same slab, back. | Held in reserve; the scenario does not need it. |
| `reference/slab-listing.jpg` | The same file as `fake-slab/slab-front.jpg`. | The reference set for the reused-photo check. The scam listing uses this picture, so the perceptual hash matches it and the Buyer Pal can say where it has seen the picture before. |

The empty box scenario reuses the clean deal's console and box photos on purpose: it is the same physical console. The reused-photo check compares against the `reference/` folder only, so two demo deals sharing a photo is not a flag.

Phone originals that were not used: IMG_5074, IMG_5081, IMG_5085.

## Why legibility matters

The pals fetch these images and read them with a vision model. Four things come back per photo: the brand, the model, a serial, and whether the item itself is in the picture. A serial is copied character for character or not reported at all, never guessed. A serial read off a box, a label or any packaging is recorded separately from a serial read off the item, because a box label is not the item. If a photo cannot be loaded or read, the pal says which photo and what it did instead.

## Real values in the fixtures

| Thing | Value |
|---|---|
| Console model | `CFI-1015A`, disc edition, manufactured February 2021 |
| Console serial, on the item and on the box label | `AJ164952580` |
| Card | 2018 Pokemon Japanese Sun & Moon Tag Bolt, Gengar & Mimikyu GX, 038/095 |
| Cert | `72096346`, graded GEM MT 10 |

If any of these are re-shot, update `packages/contracts/src/fixtures` to match and run the contracts tests, which check that the card and the grader's record agree.
