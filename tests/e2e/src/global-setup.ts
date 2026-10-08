/**
 * Warms the dev server once before the workers start. In dev mode Next
 * compiles each page and API route on its first hit; with several specs
 * starting at once those compiles pile up and a 15 s step wait runs out.
 * One clean deal through the API, plus a load of every page, pays each
 * route's compile ahead of time. Skipped against a remote server, where
 * nothing may be written.
 */
import { cleanPs5 } from "@pay-pals/contracts";
import { BASE_URL, STARTS_SERVER } from "./env";

type Json = Record<string, unknown>;

async function post(path: string, body: Json): Promise<Json> {
  const res = await fetch(`${BASE_URL}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok) throw new Error(`warm-up: POST ${path} -> ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

async function get(path: string): Promise<void> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`warm-up: GET ${path} -> ${res.status}`);
}

export default async function globalSetup(): Promise<void> {
  if (!STARTS_SERVER) return;
  const started = Date.now();
  const card = cleanPs5.cards[0]!;
  const photo = card.photos[0]!;

  // Pages a judge opens, and the demo start.
  await get("/");
  await get("/deals/new");
  const demo = await fetch(`${BASE_URL}/api/demo/start`, { method: "POST", body: new URLSearchParams({ scenario: "clean-ps5", as: "buyer" }), redirect: "manual" });
  const demoRoom = demo.headers.get("location");
  if (demoRoom) await get(new URL(demoRoom, BASE_URL).pathname + "?as=buyer");

  // One buyer-first clean deal through every route, the way the specs do it.
  const { dealId } = (await post("/api/deals/invite", {
    buyer: { displayName: cleanPs5.buyer.displayName, email: cleanPs5.buyer.email },
    sellerEmail: cleanPs5.seller.email,
    listingUrl: cleanPs5.deal.listingUrl,
  })) as { dealId: string };
  const api = (action: string, body: Json = {}) => post(`/api/deals/${dealId}/${action}`, body);
  await get(`/deals/${dealId}?as=buyer`);
  await get(`/deals/${dealId}/join?as=seller`);
  await api("seller-join", {
    displayName: cleanPs5.seller.displayName,
    sellerPaypalEmail: cleanPs5.seller.email,
    listingText: cleanPs5.listingText,
    sellerNotes: cleanPs5.sellerNotes,
    photos: [photo],
  });
  await api("review");
  // One card change through the Seller Pal (REVIEWED back to LISTED), then a fresh review before agreeing.
  await api("card", {
    request: { field: "photos", request: "Warm-up: add the Console Information screen." },
    sellerReply: "Added.",
    photos: [cleanPs5.cards[1]!.photos[cleanPs5.cards[1]!.photos.length - 1]!],
  });
  await api("review");
  await api("agree", { by: "buyer", override: false });
  await api("agree", { by: "seller", override: false });
  const order = (await api("order", { method: "paypal" })) as { paypalOrderId: string };
  await api("capture", { orderId: order.paypalOrderId });
  const snapshot = (await (await fetch(`${BASE_URL}/api/deals/${dealId}`)).json()) as { checklist?: { id: string }[] };
  await api("ship", {
    carrier: cleanPs5.shipment!.carrier,
    trackingNumber: cleanPs5.shipment!.trackingNumber,
    packingPhotos: cleanPs5.shipment!.packingPhotos,
    doneIds: (snapshot.checklist ?? []).map((c) => c.id),
  });
  await api("deliver");
  await api("arrival", { photos: cleanPs5.arrivalPhotos });
  await api("complete");
  await api("evidence", { by: "buyer" });
  await get(`/deals/${dealId}/evidence?as=buyer`);
  await api("messages", { by: "buyer", text: "Warm-up message." }).catch(() => undefined);

  // A second deal the seller refuses, so the decline route and the review with no card are compiled too.
  const refused = (await post("/api/deals/invite", {
    buyer: { displayName: cleanPs5.buyer.displayName, email: cleanPs5.buyer.email },
    sellerEmail: "warm-up-seller@example.com",
    listingUrl: null,
  })) as { dealId: string };
  await post(`/api/deals/${refused.dealId}/decline`, { by: "seller", reason: "Friends and Family only." });
  await post(`/api/deals/${refused.dealId}/review`, {});

  console.log(`[e2e] warm-up done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}
