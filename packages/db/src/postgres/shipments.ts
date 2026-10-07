/**
 * Shipments repository: one shipment per deal, delivered_at filled in later.
 */
import { eq } from "drizzle-orm";
import type { Shipment } from "@pay-pals/contracts";
import { shipments } from "../../schema";
import { DealNotFoundError } from "../errors";
import type { Db } from "./db";
import { toShipment, toShipmentRow } from "./mappers";
import { isUuid } from "./uuid";

export function shipmentsRepo(db: Db) {
  return {
    async saveShipment(shipment: Shipment): Promise<Shipment> {
      if (!isUuid(shipment.dealId)) throw new DealNotFoundError(shipment.dealId);
      const row = toShipmentRow(shipment);
      const [saved] = await db
        .insert(shipments)
        .values(row)
        .onConflictDoUpdate({
          target: shipments.dealId,
          set: {
            carrier: row.carrier,
            trackingNumber: row.trackingNumber,
            packingPhotos: row.packingPhotos,
            checklist: row.checklist,
            shippedAt: row.shippedAt,
            deliveredAt: row.deliveredAt,
          },
        })
        .returning();
      return toShipment(saved!);
    },

    async getShipment(dealId: string): Promise<Shipment | null> {
      if (!isUuid(dealId)) return null;
      const [row] = await db.select().from(shipments).where(eq(shipments.dealId, dealId));
      return row ? toShipment(row) : null;
    },
  };
}
