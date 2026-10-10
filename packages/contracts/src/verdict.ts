/**
 * What the Buyer Pal returns: a review verdict before money moves, and an
 * arrival check after delivery.
 */
import { z } from "zod";
import { RedFlagSchema } from "./red-flag";
import { PhotoSchema } from "./item-card";

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

export const CERT_PROVIDERS = ["psa", "fixture"] as const;

/** What the grader's records say about a certificate number. */
export const CertRecordSchema = z.object({
  provider: z.enum(CERT_PROVIDERS),
  certNumber: z.string().min(1),
  /** Null when the grader has no record for this number. */
  subject: z.string().nullable(),
  grade: z.string().nullable(),
  year: z.string().nullable(),
  brand: z.string().nullable(),
  /** Raw grader response, kept for the evidence pack. */
  raw: z.record(z.unknown()).nullable(),
  checkedAt: z.string().datetime(),
});
export type CertRecord = z.infer<typeof CertRecordSchema>;

export const CertCheckSchema = z.object({
  record: CertRecordSchema,
  /** True when the record describes the card on the item card; false on a mismatch or a missing record; null when nothing could be compared. */
  matches: z.boolean().nullable(),
  explanation: z.string().min(1).max(300),
});
export type CertCheck = z.infer<typeof CertCheckSchema>;

/**
 * Why a pal decided what it decided. Four groups, each a list of short plain
 * sentences, so the reasons can be laid out, tested and checked one claim at a
 * time rather than buried in prose.
 *
 * The honesty rule this field exists to serve: a pal says what it checked and
 * what it checked it against. `couldNotVerify` is the one that matters most,
 * because it is the thing a pal is tempted to leave out.
 */
export const PalReasoningSchema = z.object({
  /** What the pal looked at. "The serial on the back of the console, against the box label." */
  checked: z.array(z.string().min(1).max(300)),
  /** What it found when it looked. */
  found: z.array(z.string().min(1).max(300)),
  /** What it could not establish, and why not. Never left empty to look confident. */
  couldNotVerify: z.array(z.string().min(1).max(300)),
  /** What would move this verdict, so the other side knows what to send. */
  wouldChangeMyMind: z.array(z.string().min(1).max(300)),
});
export type PalReasoning = z.infer<typeof PalReasoningSchema>;

export const VerdictSchema = z.object({
  dealId: z.string().min(1),
  /** 0 when the review ran with no card (a refusal reviewed from the chat alone). */
  cardVersion: z.number().int().nonnegative(),
  overall: z.enum(VERDICT_OVERALLS),
  flags: z.array(RedFlagSchema),
  priceCheck: PriceCheckSchema.nullable(),
  /** Set when the card carries a certificate number. */
  certCheck: CertCheckSchema.nullable().optional(),
  /** Things the Buyer Pal wants before it will say go. Shown to the seller. */
  questionsForSeller: z.array(z.string().min(1).max(300)),
  /** Short plain summary for the buyer's chat pane. */
  palMessage: z.string().min(1),
  /** What the pal checked, found, could not verify, and what would change its mind. */
  reasoning: PalReasoningSchema.optional(),
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
  /** The arrival photos the check was made from, kept with the result for the evidence pack. */
  photos: z.array(PhotoSchema).optional(),
  palMessage: z.string().min(1),
  /** Same four groups as a review. What it read off the arrival photos, and what it could not. */
  reasoning: PalReasoningSchema.optional(),
  createdAt: z.string().datetime(),
});
export type ArrivalCheck = z.infer<typeof ArrivalCheckSchema>;
