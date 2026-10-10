# Recorded PayPal bodies

Bodies PayPal actually sent, kept verbatim so a test can replay them instead of
replaying something we wrote ourselves. Sandbox only.

## `customer-dispute-created.json`

The `CUSTOMER.DISPUTE.CREATED` webhook event PayPal delivered to
`https://pay-pals-m00n1.vercel.app/api/paypal/webhook` on 2026-10-10, for case
`PP-R-BWV-10190936`, which the sandbox buyer opened by hand in the Resolution
Center against the Pay Pals capture `35F21684R9839603W`. The whole story of that
dispute is in `docs/paypal-disputes-assessment.md`.

Fetched back out of PayPal on 2026-10-10 with
`GET /v1/notifications/webhooks-events/WH-2K820509XY442320B-2X675859T8400442R`,
so this is PayPal's own record of the delivery and not a transcription.

**One field is changed.** `resource.disputed_transactions[0].seller.merchant_id`
was `WUYUYZFRBWFT4`, the sandbox seller account's PayPal merchant id. It is
replaced with `REDACTEDMRCH1`. Nothing in Pay Pals reads it. Everything else is
byte for byte what PayPal sent.

The body carries no email address. PayPal names the seller with a merchant id
and the display name `John Doe`, which is its own sandbox placeholder, so there
was nothing else to scrub.

The deal id in `invoice_number`, and the deal id plus history chain head in
`custom`, belong to a sandbox demo deal and are left as PayPal sent them: the
point of the fixture is that our own `dealId#hash` survives the round trip
through PayPal and comes back in a shape `parseCustomId` reads. The replay test
re-keys them to the deal it seeds, so the fixture stays a record and the test
still runs.
