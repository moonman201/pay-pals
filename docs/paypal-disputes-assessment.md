# PayPal Disputes API in sandbox: what we can and cannot do

Written 2026-10-10 by the Pay Pals PayPal lane. Sandbox only. Every call in this
document was made against `https://api-m.sandbox.paypal.com` with the Pay Pals
sandbox app credentials. No live call was made and no live credential exists in
this repo.

## The short answer

Sandbox can produce a real dispute against a Pay Pals capture, and we proved it:
case **PP-R-BWV-10190936**, opened by the sandbox buyer against our sandbox
capture `35F21684R9839603W`. PayPal's own filing screen listed our locked card
text, "Sony PlayStation 5 disc edition, CFI-1015A, with the original box,
$420.00 USD x 1", as the disputed item, and it accepted a Pay Pals evidence file
as a supporting document. So the item card we put on the order is what the buyer
sees inside PayPal when something goes wrong. That is a real demo moment.

PayPal also delivered `CUSTOMER.DISPUTE.CREATED` to our webhook about four minutes
later, carrying our deal id in `invoice_number`, our chain head in `custom` and our
serial and card title in the disputed line item. The inbound half of the loop
works end to end on a real dispute, not just in our tests.

What we cannot do is drive any of it from our own code. The dispute was opened by
hand, as the buyer, in the sandbox Resolution Center. Every write path through the
API is closed to us:

- There is no public create-dispute endpoint. The sandbox-only one exists, our
  token even carries the `disputes/create` scope, and it still refuses us:
  `400 {"error":"invalid_request","error_description":"No permissions to set target_client_id"}`.
  PayPal gates the buyer-side simulation behind an account manager.
- Our app cannot see the dispute at all. `GET /v1/customer/disputes` returns an
  empty list, and `GET /v1/customer/disputes/PP-R-BWV-10190936` returns
  `403 NOT_AUTHORIZED / ACTION_NOT_ALLOWED`. The dispute belongs to the buyer and
  the seller. We are a third party that created the order, not a party to it.
- `POST /v1/customer/disputes/{id}/provide-evidence` returns the same
  `403 NOT_AUTHORIZED` on that real dispute. Submitting our evidence pack through
  the API needs the seller's consent, which means third party permissions or a
  partner arrangement, not more code.

So: showing a real dispute in the demo is cheap and worth doing. Submitting the
evidence pack to PayPal through the API is not available to us in v1, and no
amount of work changes that on our own.

## What we proved with a call

Every claim in this section comes from a request we made on 2026-10-10. Status
codes and error bodies are quoted as PayPal returned them.

### A real sandbox order, captured, with the card text on it

`npm run gate -w packages/paypal -- --account personal --no-wait` created and
captured a fresh order through the PayPal wallet, approved as the sandbox buyer:

| | |
|---|---|
| Order | `3AC53712FN382781N` |
| Capture | `35F21684R9839603W`, COMPLETED, 420.00 USD, seller net 404.85 after a 15.15 fee |
| Payee | the sandbox personal seller |
| `custom_id` | `bf917430-...#fa0f41fc...` (deal id plus history chain head) |
| Line item | name and description carry the title, `Serial AJ164952580` and `Condition: Good` |

A second gate run against the business seller produced order `6G217611X45211835`
and capture `46D80898WV201093U` the same way, funded by the sandbox test card.

### The Disputes API endpoints that answer us

`GET /v1/customer/disputes` returns **200** with `{"items": []}`. It also takes
`dispute_state` (`OPEN_INQUIRIES`, `REQUIRED_ACTION`, and the rest) and returns
200 for each. The list is scoped to the account the token belongs to. Our app is
not the payee on a Pay Pals order, so the list is empty even when a dispute
exists against one of our captures. We confirmed that after opening the real
dispute: still `{"items": []}`.

A made-up dispute id returns `404 RESOURCE_NOT_FOUND` with
`information_link: https://developer.paypal.com/docs/api/customer-disputes/v1/#errors`,
not an HTML 404, on `GET /{id}`, `provide-evidence`, `require-evidence`,
`adjudicate`, `accept-claim`, `send-message` and `provide-supporting-info`. That
proves the routes exist and are reachable with our token. `escalate` returns
`422 ACTION_NOT_ALLOWED_IN_CURRENT_DISPUTE_STATE`, `appeal` and `make-offer`
return `400` on the body, and `accept-offer` and `deny-offer` return
`403 NOT_AUTHORIZED` because those are buyer-only actions.

### The scopes our sandbox app already has

The token response lists, among others:

```
https://uri.paypal.com/services/disputes/create
https://uri.paypal.com/services/disputes/read-buyer
https://uri.paypal.com/services/disputes/read-seller
https://uri.paypal.com/services/disputes/update-seller
https://uri.paypal.com/services/documents/disputes/download
```

Having the scope is not the same as being allowed to act. All five are present
and the create call is still refused.

### Create is refused, with the exact error

PayPal documents a sandbox-only `POST /v1/customer/disputes` that takes
`multipart/form-data` with a JSON part named `input` plus a `PayPal-Auth-Assertion`
header naming the buyer. We sent exactly that:

| What we sent | What came back |
|---|---|
| multipart `input` + `PayPal-Auth-Assertion` | `400 {"error":"invalid_request","error_description":"No permissions to set target_client_id"}` |
| multipart `input`, no assertion | `400 INVALID_REQUEST` |
| JSON body, `seller_transaction_id` | `400 INVALID_BUYER_TRANSACTION_ID` |
| JSON body, `buyer_transaction_id` with a fake id | `400 TRANSACTION_NOT_ELIGIBLE` |
| JSON body, `buyer_transaction_id` with our real capture | `400 MISSING_ISSUE_TYPE`, then opaque `INVALID_REQUEST` once `extensions.merchandize_dispute_properties` is added |

The useful reading: the endpoint is real, it validates, and `buyer_transaction_id`
is the field it wants. The `target_client_id` error is the wall. It says our
client is not allowed to act as another party, which is what the auth assertion
asks for. Nothing in the body fixes that.

Also worth recording: the buyer's side of a capture has its own transaction id.
Our capture `35F21684R9839603W` appears to the buyer as `8Y700853H3509722W`. The
Resolution Center URL uses the buyer's id, and so does the create API.

### A real dispute, opened by hand

Signed in to `sandbox.paypal.com` as the sandbox buyer, the Resolution Center
offered our Oct 10 payment as a reportable transaction and took us through the
whole filing:

1. Reason: "I received an item or service that was different or not as described".
2. **Items to report: "Sony PlayStation 5 disc edition, CFI-1015A, with the original box, $420.00 USD x 1".** This is our locked card title, read off the PayPal order's line item. PayPal asked for an item type and a category for it.
3. Details: a free text description (120 character minimum, 2000 maximum), delivery date, expected refund amount, and whether the buyer wants to return the item.
4. **Documents: "Add documents to support your case". PayPal asks for photos of the item promised, the listing details, the order receipt, conversations with the seller, and the return policy. Limits shown on the page: JPG, JPEG, GIF, PNG, PDF, TXT, at most 10 files, 10 MB each, 50 MB in total.** We attached a Pay Pals evidence pack text file and PayPal accepted it.
5. A review screen that repeats all of it, then Submit.

Result: `Case ID: PP-R-BWV-10190936`, "Your message has been sent to the seller",
with a seller response window to October 30, 2026.

The `PP-R-` prefix matters. This is the pre-dispute message stage, not yet a formal
`PP-D-` dispute. PayPal's flow puts the buyer in touch with the seller first and
escalates from there.

### What our app can see afterwards, and the webhook

After the case was open:

| Call | Result |
|---|---|
| `GET /v1/customer/disputes` | `200 {"items": []}` |
| `GET /v1/customer/disputes/PP-R-BWV-10190936` | `403 NOT_AUTHORIZED`, `ACTION_NOT_ALLOWED` |
| `POST /v1/customer/disputes/PP-R-BWV-10190936/provide-evidence` | `403 NOT_AUTHORIZED`, `ACTION_NOT_ALLOWED` |

So the API tells us nothing about a dispute on a deal we created. The webhook does.

### The dispute webhook does reach us, and it matches the deal

Our webhook `6BJ660763N133044S` at `https://pay-pals-m00n1.vercel.app/api/paypal/webhook`
is subscribed to `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED` and
`CUSTOMER.DISPUTE.CREATED`, all ENABLED. PayPal fired all three for this deal even
though the payee is a different sandbox account.

`CUSTOMER.DISPUTE.CREATED` arrived as event `WH-2K820509XY442320B-2X675859T8400442R`
about four minutes after the case was filed. The resource carries everything the
handler in `packages/paypal/src/webhook-handler.ts` reads:

```
dispute_id                : PP-R-BWV-10190936
reason                    : MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED
status                    : UNDER_REVIEW
dispute_life_cycle_stage  : INQUIRY
dispute_channel           : INTERNAL
disputed_transactions[0].invoice_number        : bf917430-...        (our bare deal id)
disputed_transactions[0].custom                : bf917430-...#fa0f41fc...  (deal id plus chain head)
disputed_transactions[0].seller_transaction_id : 35F21684R9839603W   (our capture)
disputed_transactions[0].items[0].item_id      : AJ164952580         (our serial, from the line item sku)
disputed_transactions[0].items[0].item_name    : Sony PlayStation 5 disc edition, CFI-1015A, with the original box
```

`dealIdFromPayPal(invoice_number, custom)` resolves the deal from this with no
change, which is what moves the deal to `ISSUE` and starts the evidence pack. We
read these fields off the real event; we did not replay the body through the
handler, so qa should turn this resource into a fixture and do that.

Two more things worth noting from the event. The seller is
`seller_protection_eligible: true` with `EXPANDED_SELLER_PROTECTION`, and the
buyer's free text and attached note come through in `items[0].notes` and
`messages[0].content`.

## What we read, and did not prove with a call

From PayPal's own docs (`developer.paypal.com/docs/api/customer-disputes/v1/`,
`/platforms/disputes/*`, `/disputes/set-up`, and the published OpenAPI spec at
`github.com/paypal/paypal-rest-api-specifications`):

- The public Disputes v1 surface is 15 operations. `adjudicate` and
  `require-evidence` are marked sandbox only and are how a test drives a dispute
  to a decision. Both need the dispute to be `UNDER_REVIEW` and the matching
  HATEOAS link to be present.
- "The create, cancel, compute metrics, change reason, and validate eligibility
  methods are available as a limited-release solution at this time. For more
  information, reach out to your PayPal account manager."
- "In the live environment, merchants cannot create disputes but can only respond
  to customer-created disputes. However, merchants can create disputes in the
  sandbox environment."
- To use the sandbox create path you must ask an account manager to add
  `DISPUTE_CREATE` and `UPDATE_BUYER` to the REST app, and you must get the
  buyer's consent through a Log in with PayPal flow before the
  `PayPal-Auth-Assertion` is honoured. That matches the `target_client_id` refusal
  we got.
- `provide-evidence` is multipart only: a JSON part named `input` carrying an
  `evidences` array, plus `evidence-file` parts. Supported file types are jpg,
  jpeg, gif, png and pdf, under 10 MB per file and 50 MB per call. Notes are
  capped at 2000 characters. A merchant may provide evidence when the dispute is
  `WAITING_FOR_SELLER_RESPONSE`; a buyer when it is `WAITING_FOR_BUYER_RESPONSE`.
  There are 77 `evidence_type` values; PayPal's own sandbox test data says to use
  `OTHER`.
- `provide-supporting-info` is the JSON sibling, and only applies when the stage
  is `CHARGEBACK`, `PRE_ARBITRATION` or `ARBITRATION`.
- Acting on another account's disputes needs `PayPal-Auth-Assertion` and, in
  PayPal's words, "you must get consent to act on behalf of a merchant".
- The ordinary merchant-side Disputes API is a self serve checkbox
  (Features, Customer disputes) in both sandbox and live. It is not partner gated.
  It just gives you *your own* account's disputes.
- There is no negative-testing trigger that creates a dispute. `PayPal-Mock-Response`
  is not supported on the Disputes API; our probe with that header returned 403.
  The disputes test values are magic ids that simulate error responses only.

## Could our evidence pack be submitted as is?

Not as it stands, for two separate reasons.

**Shape.** Our evidence pack is a structured object rendered as a web page. PayPal
wants files: jpg, jpeg, gif, png, pdf, plus txt in the buyer-side web upload. It
also wants them labelled with an `evidence_type` and, for the fulfilment types, a
`tracking_info` block. Turning the pack into a PDF plus the already-stored photos
is the work, and it is not large: the pack already holds the locked card, the
serial, the chat, the verdicts, the payment, the shipment, the arrival check and
a plain summary, which maps cleanly onto what PayPal's upload screen asks for
(photos of the item promised, listing details, order receipt, conversations with
the seller).

**Permission.** The API call that takes it, `provide-evidence`, can only be made
by a party to the dispute. For a Pay Pals deal that is the seller. We get 403.

## What partner approval gates

| Thing | Blocked on |
|---|---|
| Reading and answering disputes on **our own** account | Nothing. Self serve checkbox. Not useful to us, because we are never the payee. |
| Reading or answering disputes on the **seller's** account | The seller granting third party permissions, or a partner arrangement. Approval, not effort. This is already recorded in PLAN.md as out of v1. |
| Creating a dispute through the API in sandbox | An account manager adding `DISPUTE_CREATE` and `UPDATE_BUYER`, plus buyer consent. Approval, not effort. |
| `adjudicate` and `require-evidence` to drive a sandbox dispute to a decision | Nothing extra, but they only work on a dispute the caller can see, so in practice the same permission wall. |
| Downloading evidence documents | An account manager adding the download scope. Limited release. |
| Opening a dispute as the buyer in the sandbox Resolution Center | Nothing. Proven today. |

## Effort estimate

### (a) Show a real sandbox dispute against a Pay Pals capture in the demo

**Half a day to one day. Low risk.** The hard part is already done and recorded
above: the case exists, and PayPal's filing screen quotes our card text back.

What it costs:

- Record the Resolution Center walkthrough for the video, or script it with
  Playwright the way we did today. About 2 hours either way. The script in this
  lane's scratchpad already does the whole flow headlessly and can be cleaned up
  into `packages/paypal/scripts/` if we want it repeatable.
- A fixture built from the real `CUSTOMER.DISPUTE.CREATED` resource above, replayed
  through `handleWebhookEvent`, so the ISSUE transition and the evidence pack are
  proved against PayPal's real shape and not only our synthetic one. About 2 hours
  for qa.
- Copy discipline. We must not say "we filed the dispute" or "PayPal shows our
  evidence". We can say: the card text we locked is the text PayPal puts in front
  of the buyer when they report a problem, PayPal tells us about the dispute with
  our own deal id attached, and our pack is ready to attach.

**Named risks.** The webhook took about four minutes to arrive, which is fine for a
recording and awkward for a live click-through; the demo should not stall waiting
for it. The case is at the `PP-R-` inquiry stage, not a formal `PP-D-` dispute, and
getting to a formal one needs the seller to let the clock run, so a live demo of a
*formal* dispute is not reproducible on command. And the Resolution Center filing
is eight screens of PayPal's own UI, which is slow on camera; the script in this
lane's scratchpad does it headlessly in about four minutes if we would rather
pre-record it.

### (b) Submit the evidence pack to PayPal through the API

**Not available in v1. Blocked on approval, not effort.**

If the permission existed, the code is small: roughly **1 to 2 days** to render
the pack as a PDF, assemble the multipart body with the right `evidence_type`
values and `tracking_info`, respect the 10 MB and 50 MB limits, and wire it to the
dispute's HATEOAS `provide-evidence` link with tests. Call it 2 to 3 days with the
PDF rendering done properly.

Before any of that we would need, in order: the seller to grant us third party
permissions or a partner arrangement with PayPal, and a `PayPal-Auth-Assertion`
flow to carry it. Both are conversations with PayPal with no date attached. The
`403 ACTION_NOT_ALLOWED` we got today is the proof that nothing we write gets
around it.

**Recommendation.** Do (a). Keep (b) out of v1 exactly as PLAN.md already says,
and in the submission describe the pack as proof the buyer or seller can attach
to a PayPal case, because PayPal's own upload screen asks for precisely the five
things the pack contains. That claim is true and we can show it.

The stronger claim we can now make, and could not before today: when a buyer
reports a problem, PayPal shows them the exact item text Pay Pals locked onto the
order, and PayPal tells Pay Pals about it with our deal id and our history chain
head attached. The deal moves to ISSUE and the pack builds itself. That whole
sentence is proved by calls recorded here.

## Reproducing this

The working calls are saved in `docs/postman/pay-pals-sandbox.postman_collection.json`
under "7. Disputes API v1 (assessment, Oct 10 2026)". Run "1. OAuth token" first.
The refused create call is saved there too, with the error in its description, so
the finding can be rechecked rather than taken on trust.

To make a fresh capture to dispute:

```
npm run gate -w packages/paypal -- --account personal --no-wait
```

Then sign in at `sandbox.paypal.com` as the sandbox buyer and open the Resolution
Center. The transaction appears there within a minute of the capture.
