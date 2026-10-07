/**
 * The evidence pack: everything a party needs to open a PayPal dispute.
 */
import { z } from "zod";
import { ItemCardSchema, PhotoSchema } from "./item-card";
import { ArrivalCheckSchema, VerdictSchema } from "./verdict";
import { DealEventSchema, MessageSchema, ACTORS } from "./messages";
import { PaymentRecordSchema } from "./payment";
import { ShipmentSchema } from "./shipping";

export const EvidencePackSchema = z.object({
  dealId: z.string().min(1),
  builtBy: z.enum(ACTORS),
  builtAt: z.string().datetime(),
  lockedCard: ItemCardSchema,
  verdicts: z.array(VerdictSchema),
  arrivalCheck: ArrivalCheckSchema.nullable(),
  messages: z.array(MessageSchema),
  photos: z.array(PhotoSchema),
  payment: PaymentRecordSchema.nullable(),
  shipment: ShipmentSchema.nullable(),
  timeline: z.array(DealEventSchema),
  /** Plain-language account of what happened, written for a dispute reviewer. */
  summary: z.string().min(1),
  /** The chain head recorded on the PayPal order, and whether the stored events still reproduce it. */
  historyHash: z.string().length(64).nullable().optional(),
  historyVerified: z.boolean().nullable().optional(),
});
export type EvidencePack = z.infer<typeof EvidencePackSchema>;
