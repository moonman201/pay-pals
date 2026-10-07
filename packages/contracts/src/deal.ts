/**
 * The deal itself and the two people in it.
 */
import { z } from "zod";
import { DEAL_STATES } from "./deal-state";

export const SCENARIO_IDS = ["scam-ps5", "clean-ps5", "empty-box"] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

export const PartySchema = z.object({
  role: z.enum(["buyer", "seller"]),
  displayName: z.string().min(1).max(80),
  email: z.string().email(),
});
export type Party = z.infer<typeof PartySchema>;

export const DealSchema = z.object({
  id: z.string().min(1),
  state: z.enum(DEAL_STATES),
  /** Set when the deal was started from demo mode. Null for a real deal. */
  scenario: z.enum(SCENARIO_IDS).nullable(),
  seller: PartySchema,
  /** Null until a buyer opens the deal link. */
  buyer: PartySchema.nullable(),
  currentCardVersion: z.number().int().nonnegative(),
  lockedCardVersion: z.number().int().positive().nullable(),
  /**
   * Two-sided agreement (PLAN.md Decision 5). Each side agrees to the current
   * card version. Saving a new version clears both. When the second one lands
   * the card locks and the deal moves to AGREED.
   */
  buyerAgreedAt: z.string().datetime().nullable(),
  sellerAgreedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Deal = z.infer<typeof DealSchema>;
