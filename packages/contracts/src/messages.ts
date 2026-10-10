/**
 * Who can act in a deal, chat messages, and the shared timeline.
 */
import { z } from "zod";
import { PhotoSchema } from "./item-card";
import { DEAL_STATES } from "./deal-state";

export const ACTORS = ["buyer", "seller", "buyer_pal", "seller_pal", "system", "paypal"] as const;
export type Actor = (typeof ACTORS)[number];

/**
 * deal: the shared chat both humans see.
 * buyer_pal: private between the buyer and the Buyer Pal.
 * seller_pal: private between the seller and the Seller Pal.
 */
export const MESSAGE_CHANNELS = ["deal", "buyer_pal", "seller_pal"] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export const MessageSchema = z.object({
  id: z.string().min(1),
  dealId: z.string().min(1),
  channel: z.enum(MESSAGE_CHANNELS),
  author: z.enum(ACTORS),
  text: z.string(),
  photos: z.array(PhotoSchema).default([]),
  at: z.string().datetime(),
});
export type Message = z.infer<typeof MessageSchema>;

export const DEAL_EVENT_KINDS = [
  "deal_created",
  "seller_invited",
  "seller_joined",
  "invite_declined",
  "card_updated",
  "review_posted",
  "agreed",
  "card_locked",
  "state_changed",
  /**
   * The buyer told Pay Pals they will pay outside Goods and Services. Pay Pals
   * warned them that they have no PayPal protection and no dispute path, wrote
   * this line, and stepped back. It never processes that payment itself, so this
   * event is the end of Pay Pals' part, not the start of one.
   */
  "off_platform_chosen",
  "payment_created",
  "payment_captured",
  "shipped",
  "shipment_checked",
  "delivered",
  "arrival_checked",
  "evidence_built",
  "dispute_opened",
] as const;
export type DealEventKind = (typeof DEAL_EVENT_KINDS)[number];

/** One line on the shared timeline. Both sides see every event. */
export const DealEventSchema = z.object({
  id: z.string().min(1),
  dealId: z.string().min(1),
  kind: z.enum(DEAL_EVENT_KINDS),
  actor: z.enum(ACTORS),
  /** Plain sentence shown on the timeline. */
  summary: z.string().min(1).max(300),
  /** Set on state_changed events. */
  fromState: z.enum(DEAL_STATES).optional(),
  toState: z.enum(DEAL_STATES).optional(),
  data: z.record(z.unknown()).optional(),
  at: z.string().datetime(),
  /**
   * Tamper-evident history. hash = sha256 over the previous hash and this
   * event's canonical fields (see history.ts). The store computes both on
   * append. The head of the chain at payment time goes into the PayPal order.
   */
  prevHash: z.string().length(64).nullable(),
  hash: z.string().length(64),
});
export type DealEvent = z.infer<typeof DealEventSchema>;
