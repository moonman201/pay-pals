# REQUEST: Pay Pals v1 (hackathon build)

Written 2026-10-06. Owner: Matt.

Build Pay Pals as described in `PRODUCT.md`, as a hosted web app judges can use, running entirely on the PayPal sandbox.

## Must have (the three demo scenarios)
Demo items (changed Oct 7): Matt's PlayStation 5 with its original box, and a PSA-graded Pokemon slab. Photos in `assets/demo-photos`. No military references anywhere in demo data.

**Buyer starts the deal.** The entry point is a payment screen where the buyer taps "Use Pay Pals Protection," enters the seller's PayPal email and the listing link. The seller gets an invite to join and upload photos. Seller-started deals stay supported but secondary. If a seller refuses the invite ("Friends & Family only"), the Buyer Pal flags the refusal as the strongest scam sign and the deal stops.

1. **Fake slab stopped.** A buyer taps Use Pay Pals Protection on a 1999 Charizard PSA 10 listed at $750, far under market, and invites the seller. The seller joins, reuses the photo from Matt's real listing, and says "I'm moving out of state tomorrow and have three other people interested, first to send Friends & Family gets it." Buyer Pal checks the cert number against PSA's official cert API: the record is a different card and grade. With the price, the Friends & Family ask and the pressure, the deal stops before any money moves.
2. **Clean deal.** A buyer invites Matt for his PS5 with its box. Matt joins. Seller Pal reads the serial on the back of the console and the serial on the box label and confirms they match, builds the card. Buyer Pal confirms the price is fair and asks for a photo of the Console Information screen. Matt adds it. Both agree. Buyer pays with PayPal (or Venmo). Seller Pal collects packing photos and tracking. Delivered. Both confirm. Done.
3. **Empty box arrives.** Seller-started. The box arrives with the foam insert and no console. Buyer Pal finds no console serial in the arrival photos, names the mismatch against the locked card, and builds the evidence pack for a PayPal dispute.

**Tamper-evident history.** Every deal event is hash-chained. The chain head at payment time is written into the PayPal order (custom_id), so PayPal's own record proves the history was not edited after payment. The evidence pack shows the recorded head and whether the stored events still reproduce it.

**PSA cert check.** The Buyer Pal has a PSA cert lookup tool (PSA public API, token `PSA_API_TOKEN` in `.env.local`, cached so tests never call it).

## Must be true
- Real PayPal sandbox orders, paid to the seller's PayPal account (payee), with the item details in the order.
- Real AI: Claude for both pals, Channel3 for market prices.
- A judge can open a hosted link and run all three scenarios without setup.
- Public GitHub repo with MIT license and clear setup steps.

## Not in v1
- Taking a platform fee (needs PayPal partner approval).
- Answering disputes on the seller's behalf (needs partner approval).
- Mobile app. Web, mobile-friendly, is enough.
