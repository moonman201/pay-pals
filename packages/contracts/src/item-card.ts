/**
 * The item card: what is being sold, versioned until both sides agree.
 * At AGREED the current version is locked and becomes the PayPal order text.
 */
import { z } from "zod";

export const CONDITION_GRADES = ["new", "like_new", "good", "fair", "for_parts"] as const;
export type ConditionGrade = (typeof CONDITION_GRADES)[number];

export const CONDITION_LABELS: Readonly<Record<ConditionGrade, string>> = {
  new: "New",
  like_new: "Like new",
  good: "Good",
  fair: "Fair",
  for_parts: "For parts",
};

export const PhotoSchema = z.object({
  /** Public URL or app-relative path (fixtures use /fixtures/<scenario>/<file>). */
  url: z.string().min(1),
  /** Plain description of what the photo shows, written for the other party. */
  whatItShows: z.string().min(1),
  /** Who added it. Pals never add photos; they ask for them. */
  addedBy: z.enum(["seller", "buyer"]),
  addedAt: z.string().datetime().optional(),
});
export type Photo = z.infer<typeof PhotoSchema>;

export const CURRENCIES = ["USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const ItemCardSchema = z.object({
  dealId: z.string().min(1),
  version: z.number().int().positive(),
  title: z.string().min(1).max(120),
  brand: z.string().min(1).max(60),
  model: z.string().min(1).max(80),
  /** Null until read from a photo or typed by the seller. */
  serial: z.string().min(1).max(64).nullable(),
  conditionGrade: z.enum(CONDITION_GRADES),
  conditionNotes: z.string().max(600),
  included: z.array(z.string().min(1).max(80)),
  photos: z.array(PhotoSchema),
  /** Whole currency units with up to two decimals, for example 475 or 475.5. */
  askingPrice: z.number().positive().multipleOf(0.01),
  currency: z.enum(CURRENCIES),
  /** The PayPal account that gets paid. Becomes purchase_units[0].payee.email_address. */
  sellerPaypalEmail: z.string().email(),
  /** Set when the card is locked at AGREED. A locked card never changes. */
  lockedAt: z.string().datetime().nullable(),
});
export type ItemCard = z.infer<typeof ItemCardSchema>;

/** Fields a buyer may ask the seller to change or add. Used by SellerPal.applyRequest. */
export type CardField = keyof Pick<
  ItemCard,
  "title" | "brand" | "model" | "serial" | "conditionGrade" | "conditionNotes" | "included" | "photos" | "askingPrice"
>;

export function isLocked(card: ItemCard): boolean {
  return card.lockedAt !== null;
}

/** Format a price the way PayPal Orders v2 expects it: "475.00". */
export function toPaypalAmount(price: number): string {
  return price.toFixed(2);
}
