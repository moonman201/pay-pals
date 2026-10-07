/**
 * Shipping and delivery: the seller records packing photos, carrier and
 * tracking; the buyer confirms the box arrived.
 */
import type { Carrier, ChecklistItem, Photo, Shipment } from "@pay-pals/contracts";
import { nowIso } from "../../mocks/ids";
import type { Services } from "../../services";
import { FlowError } from "../errors";
import { expectState, mustDeal, mustLockedCard, note, say } from "./shared";

export interface ShipInput {
  carrier: Carrier;
  trackingNumber: string;
  packingPhotos: Photo[];
  /** Ids of checklist items the seller ticked. */
  doneIds: string[];
}

export async function markShipped(services: Services, dealId: string, input: ShipInput): Promise<Shipment> {
  const deal = await mustDeal(services, dealId);
  expectState(deal, "PAID");
  const card = await mustLockedCard(services, deal);
  const list = await services.sellerPal.shipmentChecklist(deal, card);
  const checklist: ChecklistItem[] = list.data.map((c) => ({ ...c, done: input.doneIds.includes(c.id) }));
  if (input.packingPhotos.length === 0) throw new FlowError("Add at least one packing photo before marking the deal shipped.", 400);

  const shipment = await services.store.saveShipment({
    dealId,
    carrier: input.carrier,
    trackingNumber: input.trackingNumber,
    packingPhotos: input.packingPhotos,
    checklist,
    shippedAt: nowIso(),
    deliveredAt: null,
  });
  const missing = checklist.filter((c) => c.required && !c.done).length;
  const tail = missing > 0 ? ` ${missing} checklist ${missing === 1 ? "item" : "items"} left undone.` : "";
  await note(services, dealId, "shipped", "seller", `Shipped with ${shipment.carrier}, tracking ${shipment.trackingNumber}.${tail}`);
  await services.store.transition(dealId, "SHIPPED", "seller", "Shipped.");
  await say(services, dealId, "deal", "seller", `Shipped with ${shipment.carrier}. Tracking ${shipment.trackingNumber}.`, shipment.packingPhotos);
  await say(services, dealId, "buyer_pal", "buyer_pal", `The seller shipped with ${shipment.carrier}, tracking ${shipment.trackingNumber}, and posted ${shipment.packingPhotos.length} packing ${shipment.packingPhotos.length === 1 ? "photo" : "photos"}. When the box arrives, confirm delivery and show me the back of the item.`);
  await say(services, dealId, "seller_pal", "seller_pal", "Tracking saved. Keep the receipt from the carrier until the buyer confirms delivery.");
  return shipment;
}

export async function confirmDelivery(services: Services, dealId: string): Promise<Shipment> {
  const deal = await mustDeal(services, dealId);
  expectState(deal, "SHIPPED");
  const shipment = await services.store.getShipment(dealId);
  if (!shipment) throw new FlowError("No shipment on record.", 409);
  const updated = await services.store.saveShipment({ ...shipment, deliveredAt: nowIso() });
  await note(services, dealId, "delivered", "buyer", "Buyer confirmed delivery.");
  await services.store.transition(dealId, "DELIVERED", "buyer", "Delivered.");
  await say(services, dealId, "buyer_pal", "buyer_pal", "Delivered. Before you complete the deal, add a photo of the back of the item so I can compare the serial to the locked card.");
  return updated;
}
