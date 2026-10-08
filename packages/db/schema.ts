/**
 * Pay Pals database schema. Owned by the Lead. Frozen Fri Oct 9, 2026.
 * v1.3.0 (Oct 7): deals.buyer_agreed_at and seller_agreed_at, deal_event_kind gains "agreed".
 * v1.4.0 (Oct 7): scenario enum values changed (demo item changed to a PlayStation 5).
 * v1.5.0 (Oct 7): buyer-first deals (started_by, listing_url, seller_joined_at, state INVITED, three event kinds),
 *   graded items (item_cards.cert_number, grade), tamper-evident history (deal_events.prev_hash, hash; payments.history_hash),
 *   scenario enum fake-slab replaces scam-ps5.
 * v1.6.0 (Oct 8): shipments.flags (ship-time caution), deal_event_kind gains shipment_checked.
 *
 * One table per thing a deal produces. Card, verdict, payment, shipment and
 * evidence rows are never updated in place once written, except the fields
 * named in comments (card lockedAt, payment status and capture, shipment
 * deliveredAt). History is rows, not overwrites.
 *
 * builder-paypal implements repositories against this file and may add
 * indexes and migrations, but not change columns after the freeze.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  ACTORS,
  CONDITION_GRADES,
  DEAL_EVENT_KINDS,
  DEAL_STATES,
  DEAL_STARTERS,
  MESSAGE_CHANNELS,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  SCENARIO_IDS,
  CARRIERS,
} from "@pay-pals/contracts";
import type {
  ChecklistItem,
  RedFlag,
  DealEvent,
  EvidencePack,
  Photo,
  Verdict,
  ArrivalCheck,
} from "@pay-pals/contracts";

export const dealStateEnum = pgEnum("deal_state", DEAL_STATES);
export const actorEnum = pgEnum("actor", ACTORS);
export const messageChannelEnum = pgEnum("message_channel", MESSAGE_CHANNELS);
export const conditionGradeEnum = pgEnum("condition_grade", CONDITION_GRADES);
export const scenarioEnum = pgEnum("scenario", SCENARIO_IDS);
export const paymentStatusEnum = pgEnum("payment_status", PAYMENT_STATUSES);
export const paymentMethodEnum = pgEnum("payment_method", PAYMENT_METHODS);
export const carrierEnum = pgEnum("carrier", CARRIERS);
export const dealEventKindEnum = pgEnum("deal_event_kind", DEAL_EVENT_KINDS);
export const verdictKindEnum = pgEnum("verdict_kind", ["review", "arrival"]);
export const dealStarterEnum = pgEnum("deal_starter", DEAL_STARTERS);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    state: dealStateEnum("state").notNull().default("DRAFT"),
    startedBy: dealStarterEnum("started_by").notNull().default("seller"),
    listingUrl: text("listing_url"),
    sellerJoinedAt: timestamp("seller_joined_at", { withTimezone: true }),
    scenario: scenarioEnum("scenario"),
    sellerName: text("seller_name").notNull(),
    sellerEmail: text("seller_email").notNull(),
    buyerName: text("buyer_name"),
    buyerEmail: text("buyer_email"),
    currentCardVersion: integer("current_card_version").notNull().default(0),
    lockedCardVersion: integer("locked_card_version"),
    /** Two-sided agreement to the current card version. Cleared when a new version is saved. */
    buyerAgreedAt: timestamp("buyer_agreed_at", { withTimezone: true }),
    sellerAgreedAt: timestamp("seller_agreed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("deals_state_idx").on(t.state)],
);

/** One row per card version. The version with locked_at set is the order text. */
export const itemCards = pgTable(
  "item_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    brand: text("brand").notNull(),
    model: text("model").notNull(),
    serial: text("serial"),
    boxSerial: text("box_serial"),
    certNumber: text("cert_number"),
    grade: text("grade"),
    conditionGrade: conditionGradeEnum("condition_grade").notNull(),
    conditionNotes: text("condition_notes").notNull().default(""),
    included: jsonb("included").$type<string[]>().notNull().default([]),
    photos: jsonb("photos").$type<Photo[]>().notNull().default([]),
    /** Integer cents. Contracts carry dollars; the repository converts. */
    askingPriceCents: integer("asking_price_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    sellerPaypalEmail: text("seller_paypal_email").notNull(),
    /** The only column updated after insert. Set once, at AGREED. */
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: timestamps.createdAt,
  },
  (t) => [uniqueIndex("item_cards_deal_version_idx").on(t.dealId, t.version)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    channel: messageChannelEnum("channel").notNull(),
    author: actorEnum("author").notNull(),
    text: text("text").notNull(),
    photos: jsonb("photos").$type<Photo[]>().notNull().default([]),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_deal_channel_at_idx").on(t.dealId, t.channel, t.at)],
);

/** Buyer Pal output. kind = review holds a Verdict, kind = arrival holds an ArrivalCheck. */
export const verdicts = pgTable(
  "verdicts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    kind: verdictKindEnum("kind").notNull(),
    cardVersion: integer("card_version").notNull(),
    /** go | caution | stop for reviews; "match" | "mismatch" for arrival checks. Indexed for the timeline. */
    outcome: text("outcome").notNull(),
    payload: jsonb("payload").$type<Verdict | ArrivalCheck>().notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("verdicts_deal_kind_idx").on(t.dealId, t.kind)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    paypalOrderId: text("paypal_order_id").notNull(),
    /** Updated when the capture lands. */
    captureId: text("capture_id"),
    /** Updated by capture and webhook handlers. */
    status: paymentStatusEnum("status").notNull().default("CREATED"),
    payeeEmail: text("payee_email").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    method: paymentMethodEnum("method"),
    /** Head of the event hash chain when the order was created; also in the PayPal order's custom_id. */
    historyHash: text("history_hash"),
    /** Raw PayPal responses for the evidence pack and debugging. */
    rawOrder: jsonb("raw_order").$type<Record<string, unknown>>(),
    rawCapture: jsonb("raw_capture").$type<Record<string, unknown>>(),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("payments_paypal_order_id_idx").on(t.paypalOrderId),
    index("payments_deal_idx").on(t.dealId),
  ],
);

export const shipments = pgTable(
  "shipments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    carrier: carrierEnum("carrier").notNull(),
    trackingNumber: text("tracking_number").notNull(),
    packingPhotos: jsonb("packing_photos").$type<Photo[]>().notNull().default([]),
    checklist: jsonb("checklist").$type<ChecklistItem[]>().notNull().default([]),
    /** Flags the Buyer Pal raised at ship time. */
    flags: jsonb("flags").$type<RedFlag[]>().notNull().default([]),
    shippedAt: timestamp("shipped_at", { withTimezone: true }).notNull(),
    /** Updated when the buyer confirms arrival. */
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamps.createdAt,
  },
  (t) => [uniqueIndex("shipments_deal_idx").on(t.dealId)],
);

export const evidencePacks = pgTable(
  "evidence_packs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    builtBy: actorEnum("built_by").notNull(),
    summary: text("summary").notNull(),
    pack: jsonb("pack").$type<EvidencePack>().notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("evidence_packs_deal_idx").on(t.dealId)],
);

/** The shared timeline. Append only. */
export const dealEvents = pgTable(
  "deal_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    kind: dealEventKindEnum("kind").notNull(),
    actor: actorEnum("actor").notNull(),
    summary: text("summary").notNull(),
    fromState: dealStateEnum("from_state"),
    toState: dealStateEnum("to_state"),
    data: jsonb("data").$type<DealEvent["data"]>(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    /** Hash chain (contracts history.ts). Computed by the repository on append, never by callers. */
    prevHash: text("prev_hash"),
    hash: text("hash").notNull(),
  },
  (t) => [index("deal_events_deal_at_idx").on(t.dealId, t.at), uniqueIndex("deal_events_hash_idx").on(t.hash)],
);

/** Idempotency for PayPal webhooks: one row per event id we have handled. */
export const webhookReceipts = pgTable("webhook_receipts", {
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});
