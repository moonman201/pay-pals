/**
 * Shipping: the Seller Pal's packing checklist and the shipment record.
 * Tracking lives in our database. Pushing it to PayPal is a stretch goal.
 */
import { z } from "zod";
import { PhotoSchema } from "./item-card";
import { RedFlagSchema } from "./red-flag";

export const ChecklistItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(200),
  required: z.boolean(),
  done: z.boolean(),
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

export const CARRIERS = ["USPS", "UPS", "FedEx", "DHL", "Other"] as const;
export type Carrier = (typeof CARRIERS)[number];

export const ShipmentSchema = z.object({
  dealId: z.string().min(1),
  carrier: z.enum(CARRIERS),
  trackingNumber: z.string().min(1).max(64),
  /** Photos of the item going into the box and the sealed, labelled box. */
  packingPhotos: z.array(PhotoSchema),
  checklist: z.array(ChecklistItemSchema),
  shippedAt: z.string().datetime(),
  deliveredAt: z.string().datetime().nullable(),
  /** Flags the Buyer Pal raised at ship time, for example a required packing photo that is missing. */
  flags: z.array(RedFlagSchema).optional(),
});
export type Shipment = z.infer<typeof ShipmentSchema>;
