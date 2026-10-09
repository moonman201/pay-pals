# Demo photo shot list

The three demo scenarios reference 13 photos under `apps/web/public/fixtures/<scenario>/` plus one reference folder. Until these files exist on the host, every photo check falls back to the caption text and the hosted site hides the "could not be loaded" sentences. Once the files are there, the pals read the images themselves.

Shoot with a phone in daylight or a bright room, no flash glare on labels or screens. Every serial, model number and cert number must be sharp enough to read at the phone's native size. JPEG, under 5 MB each, landscape or portrait as the table says.

## The 13 fixture photos

| Path and filename | What the shot must show | What the pal reads from it |
|---|---|---|
| `fixtures/clean-ps5/console-back-serial.jpg` | Back of the white PS5, filling the frame, the serial label square to the camera. Serial and model number (CFI-1215A) legible. Even light, no reflection on the label. | Serial on the item itself, model code. Marked as the item's serial, not packaging. |
| `fixtures/clean-ps5/box-label-serial.jpg` | The barcode label on the original PS5 box, filling the frame. Serial and model legible. The box edge visible so it is clearly a box label. | Box serial. The pal compares it with the console serial and says whether they match. A box label never stands in for the item serial. |
| `fixtures/clean-ps5/front-with-box.jpg` | The console standing next to its open box, with the controller and the two cables laid out. Whole scene in frame, portrait is fine. | Item present, what is included. No serial expected here. |
| `fixtures/clean-ps5/console-information-screen.jpg` | The TV showing the PS5 Console Information page (Settings, System, Console Information). Serial and system software version legible on screen. Shoot the TV straight on, dim the room to avoid reflections. | Serial on screen (counts as the item's serial), software version. This is the proof the Buyer Pal asks for. |
| `fixtures/clean-ps5/packing-in-box.jpg` | The PS5 box with the console, controller and cables inside, sitting in the larger shipping box with padding, before sealing. Shot from above. | Packing proof: item going into the box. Required checklist photo. |
| `fixtures/clean-ps5/packing-sealed.jpg` | The sealed shipping box with the carrier label on it. Label legible enough to show it is a shipping label; the address may be blurred. | Packing proof: sealed box with label. Required checklist photo. |
| `fixtures/clean-ps5/arrival-console-serial.jpg` | Back of the same PS5 on a different surface (a desk), serial label legible. Same serial as the console-back shot. | Arrival serial on the item. Must match the locked card for the clean deal to pass. |
| `fixtures/empty-box/console-back-serial.jpg` | Same framing as the clean console-back shot. May be the same photo as `clean-ps5/console-back-serial.jpg` (the scenarios share the PS5; see note below). | Serial on the item, model code. |
| `fixtures/empty-box/box-label-serial.jpg` | Same framing as the clean box-label shot. May be the same photo as `clean-ps5/box-label-serial.jpg`. | Box serial, compared with the console serial. |
| `fixtures/empty-box/packing-sealed.jpg` | Sealed shipping box with the label, as for the clean deal. May reuse `clean-ps5/packing-sealed.jpg`. This scenario has no packing-in-box photo on purpose: the seller skipped it. | Packing proof: sealed box only. The missing in-box photo is what the ship-time check flags. |
| `fixtures/empty-box/arrival-box-open-empty.jpg` | The PS5 box opened on a table with only the grey foam insert inside. No console, no controller, no cables anywhere in frame. Shot from above so the empty cavity is obvious. | Item not present. With vision on, this photo alone makes the arrival check say "not present, box arrived empty". |
| `fixtures/empty-box/arrival-box-label.jpg` | The barcode label on the box that arrived, legible, same serial as the box-label shot. | Box serial on arrival. It must not count as the item serial; the pal says so. |
| `fixtures/fake-slab/slab-front.jpg` | Front of a PSA slab on a wooden table, label filling the top of the frame. Card name, set, grade (PSA 10 or GEM MT 10) and the cert number legible. The card art can be the real listing's card. | Cert number and grade from the label. The Buyer Pal checks the cert with PSA (or the demo record) and compares the card and grade. |

## The serials in the fixtures

The fixtures use placeholder serials: `AH912345678` for the clean deal, `AJ204567113` for the empty box, cert `81234567` for the slab. When you shoot the real console, send the Lead the real serial and the real box serial so the fixtures can be updated before the photos land. The photos and the fixture text must agree, otherwise the arrival check on the clean deal will report a mismatch.

## Shared shots

The clean deal and the empty box are the same PS5. The empty-box folder may reuse the clean deal's console-back, box-label and sealed-box photos as copies with the empty-box filenames; the only photos unique to the empty box are the two arrival shots (open box with foam, box label on arrival). If the fixtures keep different serials for the two scenarios, the shared photos cannot be literal copies, so prefer giving both scenarios the real serial.

## Reference folder

`assets/demo-photos/reference/` holds the photos the reused-photo check compares against. apps/web passes each file here as a known photo with its filename as the source.

| Path and filename | What it is | What the pal does with it |
|---|---|---|
| `reference/charizard-listing.jpg` | The real listing photo of the slab, the one the scam seller "reuses". Shoot the slab the same way as `fake-slab/slab-front.jpg`; the two files may be the same picture saved twice, or the same scene reshot. | The Buyer Pal hashes every card photo and compares it with this one. A near duplicate raises STOCK_OR_REUSED_PHOTO with evidence naming this file. Resizing, re-saving or a small brightness change still matches; a different photo of the same slab from another angle does not. |

Do not put the clean deal's photos in the reference folder, or the clean deal would flag itself.

## How the vision read works, and why legibility matters

For every photo the pal can load, it sends the image to the vision model and asks for exactly four things: brand, model, the serial as printed, and where that serial is printed (on the item itself or on a box, label or packaging), plus whether the item is in the picture at all. The model is told to copy the serial character for character and to return nothing if any character is unclear. A blurry label does not produce a wrong serial; it produces no serial, and the pal then says it could not confirm the item.

Three consequences for the shoot:

1. The serial on the item itself is what counts. The back-of-console label and the Console Information screen both count as the item. The box label never does; it is read, compared, and then set aside. So the console-back shot and the screen shot are the two that must be sharp.
2. The Console Information screen must show the serial, not just the software version. That screen is the proof the Buyer Pal asks the seller for on every used console, and the clean deal only reaches "go" on card version 2 because that photo answers the ask.
3. The empty-box arrival photo must make the absence obvious. The model is asked whether the item is present; an open box with nothing but foam is read as not present, which is what turns the arrival check into a dispute.

If a photo does not load (missing file, wrong path, a 404 on the host), the pal falls back to the caption written in the fixture and says so, except on the hosted site in public mode, where it stays quiet about loading and makes no claim about what the photo shows.
