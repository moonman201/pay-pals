# REQUEST: Pay Pals v1 (hackathon build)

Written 2026-10-06. Owner: Matt.

Build Pay Pals as described in `PRODUCT.md`, as a hosted web app judges can use, running entirely on the PayPal sandbox.

## Must have (the three demo scenarios)
1. **Scam stopped.** A "seller" offers a Garmin Fenix 7 Pro for $180, wants Friends & Family, uses a stock photo, and says he is deploying Friday so it has to be today. Buyer Pal flags the price (far under market via Channel3), the Friends & Family ask, the pressure and the photo. Pay Pals will not move money outside Goods & Services. The deal dies before the buyer loses anything.
2. **Clean deal.** A Marine selling a Garmin before a move. Seller Pal reads the serial off the back of the watch, builds the card. Buyer Pal confirms the price is fair and asks for a battery health photo. Seller adds it. Both accept. Buyer pays with PayPal (or Venmo). Seller Pal collects packing photos and tracking. Delivered. Both confirm. Done.
3. **Wrong item arrives.** Buyer receives a Fenix 6, not the Fenix 7 on the locked card. Buyer Pal compares the serial in the arrival photo to the locked card, flags the mismatch, and builds the evidence pack for a PayPal dispute.

## Must be true
- Real PayPal sandbox orders, paid to the seller's PayPal account (payee), with the item details in the order.
- Real AI: Claude for both pals, Channel3 for market prices.
- A judge can open a hosted link and run all three scenarios without setup.
- Public GitHub repo with MIT license and clear setup steps.

## Not in v1
- Taking a platform fee (needs PayPal partner approval).
- Answering disputes on the seller's behalf (needs partner approval).
- Mobile app. Web, mobile-friendly, is enough.
