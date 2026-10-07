# REQUEST: Pay Pals v1 (hackathon build)

Written 2026-10-06. Owner: Matt.

Build Pay Pals as described in `PRODUCT.md`, as a hosted web app judges can use, running entirely on the PayPal sandbox.

## Must have (the three demo scenarios)
Demo item (changed Oct 7): Matt's PlayStation 5 with its original box. Photos in `assets/demo-photos`.

1. **Scam stopped.** A "seller" offers a PlayStation 5 with box for $220, wants Friends & Family, reuses the photo from Matt's real listing, and says he is deploying Friday so it has to be today. Buyer Pal flags the price (far under market via Channel3), the Friends & Family ask, the pressure and the reused photo. Pay Pals will not move money outside Goods & Services. The deal dies before the buyer loses anything.
2. **Clean deal.** Matt sells the PS5 with its box. Seller Pal reads the serial on the back of the console and the serial on the box label and confirms they match, builds the card. Buyer Pal confirms the price is fair and asks for a photo of the Console Information screen. Seller adds it. Both agree. Buyer pays with PayPal (or Venmo). Seller Pal collects packing photos and tracking. Delivered. Both confirm. Done.
3. **Empty box arrives.** The box arrives with the foam insert and no console. Buyer Pal finds no console serial in the arrival photos, names the mismatch against the locked card, and builds the evidence pack for a PayPal dispute.

## Must be true
- Real PayPal sandbox orders, paid to the seller's PayPal account (payee), with the item details in the order.
- Real AI: Claude for both pals, Channel3 for market prices.
- A judge can open a hosted link and run all three scenarios without setup.
- Public GitHub repo with MIT license and clear setup steps.

## Not in v1
- Taking a platform fee (needs PayPal partner approval).
- Answering disputes on the seller's behalf (needs partner approval).
- Mobile app. Web, mobile-friendly, is enough.
