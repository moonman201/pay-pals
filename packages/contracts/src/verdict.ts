/**
 * What the Buyer Pal returns: a review verdict before money moves, and an
 * arrival check after delivery.
 */
import { z } from "zod";
import { RedFlagSchema } from "./red-flag";

export const VERDICT_OVERALLS = ["go", "caution", "stop"] as const;
export type VerdictOverall = (typeof VERDICT_OVERALLS)[number];

export const PriceSourceSchema = z.object({
  name: z.string().min(1),
  url: z.string().url().optional(),
  price: z.number().nonnegative().optional(),
  condition: z.string().optional(),
});
export type PriceSource = z.infer<typeof PriceSourceSchema>;

export const PriceCheckSchema = z.object({
  marketLow: z.number().nonnegative(),
  marketHigh: z.number().nonnegative(),
  currency: z.literal("USD"),
  /** Where the numbers came from. Channel3 for the real thing, fixture for demos. */
  sources: z.array(PriceSourceSchema),
  provider: z.enum(["channel3", "fixture"]),
  checkedAt: z.string().datetime(),
});
export type PriceCheck = z.infer<typeof PriceCheckSchema>;

export const VerdictSchema = z.object({
  dealId: z.string().min(1),
  cardVersion: z.number().int().positive(),
  overall: z.enum(VERDICT_OVERALLS),
  flags: z.array(RedFlagSchema),
  priceCheck: PriceCheckSchema.nullable(),
  /** Things the Buyer Pal wants before it will say go. Shown to the seller. */
  questionsForSeller: z.array(z.string().min(1).max(300)),
  /** Short plain summary for the buyer's chat pane. */
  palMessage: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type Verdict = z.infer<typeof VerdictSchema>;

export const MISMATCH_FIELDS = ["brand", "model", "serial", "conditionGrade", "included", "other"] as const;
export type MismatchField = (typeof MISMATCH_FIELDS)[number];

export const MismatchSchema = z.object({
  field: z.enum(MISMATCH_FIELDS),
  expected: z.string(),
  observed: z.string(),
  explanation: z.string().min(1).max(300),
});
export type Mismatch = z.infer<typeof MismatchSchema>;

export const ArrivalCheckSchema = z.object({
  dealId: z.string().min(1),
  /** Version of the locked card the arrival was compared against. */
  cardVersion: z.number().int().positive(),
  matches: z.boolean(),
  mismatches: z.array(MismatchSchema),
  /** What the pal read from the arrival photos, as best it could. */
  observed: z.object({
    brand: z.string().nullable(),
    model: z.string().nullable(),
    serial: z.string().nullable(),
  }),
  palMessage: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type ArrivalCheck = z.infer<typeof ArrivalCheckSchema>;
