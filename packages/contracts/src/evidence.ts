/**
 * The evidence pack: everything a party needs to open a PayPal dispute.
 */
import { z } from "zod";
import { ItemCardSchema, PhotoSchema } from "./item-card";
import { RedFlagSchema } from "./red-flag";
import { ArrivalCheckSchema, VerdictSchema } from "./verdict";
import { DealEventSchema, MessageSchema, ACTORS } from "./messages";
import { PaymentRecordSchema } from "./payment";
import { ShipmentSchema } from "./shipping";

/**
 * Where the hash on a payment stands against PayPal's own copy. The evidence
 * pack's tamper check may only claim PayPal corroboration in the first case.
 *
 * corroborated:  PayPal's order was read back for this pack and its custom_id
 *                carries the same hash. The strongest true claim we make.
 * recorded_only: a real PayPal order holds it, but it was not read back here,
 *                so the check is against our own record of the hash.
 * not_anchored:  no PayPal order holds it at all (a seeded example deal, whose
 *                payment ids are placeholders), so there is nothing to compare.
 *
 * Absent is read as `recorded_only`, the conservative case, because it never
 * claims corroboration. Nothing may infer the case from the shape of an order
 * id: a FIXTURE- prefix is a convention, not a contract (PLAN.md Decision 15).
 */
export const HISTORY_ANCHORS = ["corroborated", "recorded_only", "not_anchored"] as const;
export type HistoryAnchor = (typeof HISTORY_ANCHORS)[number];

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
  /** Where that hash stands against PayPal's own copy. See HISTORY_ANCHORS. */
  historyAnchor: z.enum(HISTORY_ANCHORS).optional(),
  /** Questions the Buyer Pal asked the seller that never got an answer before payment. */
  unansweredQuestions: z.array(z.string()).optional(),
  /** Flags raised at ship time (see Shipment.flags). */
  shipmentFlags: z.array(RedFlagSchema).optional(),
});
export type EvidencePack = z.infer<typeof EvidencePackSchema>;
