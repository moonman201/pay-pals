# Deal room pass, Oct 11

Matt reviewed the stolen-photo room line by line and set six rules for every
deal room. These are the before and after shots at 1280px, full page, on the
three seeded demo deals.

## Words a judge reads

Counted as `document.body.innerText`: the rendered text a sighted reader sees,
excluding markup and **excluding anything inside a collapsed expander**.
`textContent` is beside it because that one does include collapsed detail, so
the gap between the two pairs of columns is what moved behind a disclosure
rather than off the page. That distinction is rule 4, and it is the number that
matters: nothing we spent the week making honest came off the page.

| Room | Read before | Read after | Change | On page before | On page after | Height |
|---|---|---|---|---|---|---|
| Stolen photo, buyer | 2485 | **1164** | −53% | 3603 | 2775 | 6427 → 3801px |
| Stolen photo, seller | 2284 | **1117** | −51% | 3277 | 2602 | 6130 → 3557px |
| Clean deal, buyer | 3101 | **2065** | −33% | 4778 | 4237 | 8072 → 6945px |
| Clean deal, seller | 2895 | **2038** | −30% | 4372 | 4010 | 8072 → 6945px |
| Empty box, buyer | 3161 | **2131** | −33% | 4516 | 4004 | 8095 → 6671px |
| Empty box, seller | 2879 | **1930** | −33% | 3964 | 3533 | 8095 → 6671px |

On the stolen-photo room a judge reads **1321 fewer words**, but only **828
words left the page**. The other ~500 are behind the two expanders, and every
room has exactly two, both collapsed.

## One thing the after shots do not show yet

"What I could not check" still lists 5 items on the seeded slab deal rather
than Matt's 2. The fix is in `packages/agents` and is on `main`, but a seeded
verdict is written at seed time and frozen, so the room shows the old list
until the demo deals are re-seeded. The re-seed is the next step.
