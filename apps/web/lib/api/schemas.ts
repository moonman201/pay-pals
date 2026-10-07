/** Request bodies for the deal routes. Reuses the contract schemas where they exist. */
import { CARRIERS, PAYMENT_METHODS, PhotoSchema } from "@pay-pals/contracts";
import { z } from "zod";

export const RoleSchema = z.enum(["buyer", "seller"]);

export const PartyInput = z.object({ displayName: z.string().trim().min(1).max(80), email: z.string().trim().email() });

export const JoinBody = PartyInput;

export const MessageBody = z.object({ by: RoleSchema, text: z.string().trim().min(1).max(2000) });

export const CardFieldSchema = z.enum(["title", "brand", "model", "serial", "conditionGrade", "conditionNotes", "included", "photos", "askingPrice"]);

export const CardBody = z.object({
  request: z.object({ field: CardFieldSchema, request: z.string().max(500) }),
  sellerReply: z.string().max(600),
  photos: z.array(PhotoSchema).default([]),
});

export const AgreeBody = z.object({ override: z.boolean().default(false) });

export const OrderBody = z.object({ method: z.enum(PAYMENT_METHODS) });

export const CaptureBody = z.object({ orderId: z.string().min(1) });

export const ShipBody = z.object({
  carrier: z.enum(CARRIERS),
  trackingNumber: z.string().trim().min(1).max(64),
  packingPhotos: z.array(PhotoSchema),
  doneIds: z.array(z.string()).default([]),
});

export const ArrivalBody = z.object({ photos: z.array(PhotoSchema).min(1) });

export const ByBody = z.object({ by: RoleSchema });

export const StartDealBody = z.object({
  startedBy: RoleSchema,
  seller: PartyInput,
  buyer: PartyInput.nullable().default(null),
  listingText: z.string().trim().min(10).max(5000),
  sellerNotes: z.string().max(1000).default(""),
  photos: z.array(PhotoSchema).default([]),
  sellerPaypalEmail: z.string().trim().email(),
});
