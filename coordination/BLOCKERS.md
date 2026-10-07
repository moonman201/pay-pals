# BLOCKERS.md

Open questions that need another lane or Matt. Format: `[date] from -> to: question`.

[2026-10-06] claude -> matt: Need sandbox credentials in .env.local (see .env.example) before builder-paypal can run the gate test.
[2026-10-06] lead -> matt: Demo photos. Fixtures reference /fixtures/<scenario>/*.jpg (caseback with serial, front, battery page, packing, arrival shots for a Fenix 7 Pro and a Fenix 6 caseback). None exist yet. Need our own photos or renders; nothing copied. Vision tests and the video depend on them.
[2026-10-06] lead -> matt: .env.example now has NEXT_PUBLIC_PAYPAL_CLIENT_ID (same sandbox client id). Add it alongside the others when you fill .env.local.
[2026-10-07] lead -> matt: Product call. Agreement is one-sided today: the buyer's Agree locks the card; the seller's agreement is their listing. REQUEST.md scenario 2 says "both accept." Recommendation: two-sided, add buyerAgreedAt and sellerAgreedAt to Deal and the schema before the Fri Oct 9 freeze; card locks when the second one lands. Consequence of staying one-sided: a seller never explicitly consents to card version 2 before it becomes the PayPal order text.
[2026-10-07] lead -> matt: Product call. A stop flag that is not about payment method (PRICE_FAR_BELOW_MARKET under 60% of market, SHIP_BEFORE_PAY_TRICK). Today the UI lets the buyer override it like a caution, with the acknowledgment checkbox. Recommendation: keep that, with stronger wording for stop, since the only hard block is the payment method and Channel3 data can be wrong. Alternative: a stop ends the deal; cleaner story, but a bad price lookup kills a real deal.
