CREATE TYPE "public"."actor" AS ENUM('buyer', 'seller', 'buyer_pal', 'seller_pal', 'system', 'paypal');--> statement-breakpoint
CREATE TYPE "public"."carrier" AS ENUM('USPS', 'UPS', 'FedEx', 'DHL', 'Other');--> statement-breakpoint
CREATE TYPE "public"."condition_grade" AS ENUM('new', 'like_new', 'good', 'fair', 'for_parts');--> statement-breakpoint
CREATE TYPE "public"."deal_event_kind" AS ENUM('deal_created', 'card_updated', 'review_posted', 'card_locked', 'state_changed', 'payment_created', 'payment_captured', 'shipped', 'delivered', 'arrival_checked', 'evidence_built', 'dispute_opened');--> statement-breakpoint
CREATE TYPE "public"."deal_state" AS ENUM('DRAFT', 'LISTED', 'REVIEWED', 'AGREED', 'PAYMENT_PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'COMPLETE', 'BLOCKED', 'ISSUE', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."message_channel" AS ENUM('deal', 'buyer_pal', 'seller_pal');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('paypal', 'venmo');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('CREATED', 'APPROVED', 'CAPTURED', 'FAILED', 'DISPUTED');--> statement-breakpoint
CREATE TYPE "public"."scenario" AS ENUM('scam-garmin', 'clean-garmin', 'wrong-item');--> statement-breakpoint
CREATE TYPE "public"."verdict_kind" AS ENUM('review', 'arrival');--> statement-breakpoint
CREATE TABLE "deal_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"kind" "deal_event_kind" NOT NULL,
	"actor" "actor" NOT NULL,
	"summary" text NOT NULL,
	"from_state" "deal_state",
	"to_state" "deal_state",
	"data" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state" "deal_state" DEFAULT 'DRAFT' NOT NULL,
	"scenario" "scenario",
	"seller_name" text NOT NULL,
	"seller_email" text NOT NULL,
	"buyer_name" text,
	"buyer_email" text,
	"current_card_version" integer DEFAULT 0 NOT NULL,
	"locked_card_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"built_by" "actor" NOT NULL,
	"summary" text NOT NULL,
	"pack" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"brand" text NOT NULL,
	"model" text NOT NULL,
	"serial" text,
	"condition_grade" "condition_grade" NOT NULL,
	"condition_notes" text DEFAULT '' NOT NULL,
	"included" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"asking_price_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"seller_paypal_email" text NOT NULL,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"channel" "message_channel" NOT NULL,
	"author" "actor" NOT NULL,
	"text" text NOT NULL,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"paypal_order_id" text NOT NULL,
	"capture_id" text,
	"status" "payment_status" DEFAULT 'CREATED' NOT NULL,
	"payee_email" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"method" "payment_method",
	"raw_order" jsonb,
	"raw_capture" jsonb,
	"captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"carrier" "carrier" NOT NULL,
	"tracking_number" text NOT NULL,
	"packing_photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"shipped_at" timestamp with time zone NOT NULL,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verdicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"kind" "verdict_kind" NOT NULL,
	"card_version" integer NOT NULL,
	"outcome" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_receipts" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deal_events" ADD CONSTRAINT "deal_events_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_packs" ADD CONSTRAINT "evidence_packs_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_cards" ADD CONSTRAINT "item_cards_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verdicts" ADD CONSTRAINT "verdicts_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deal_events_deal_at_idx" ON "deal_events" USING btree ("deal_id","at");--> statement-breakpoint
CREATE INDEX "deals_state_idx" ON "deals" USING btree ("state");--> statement-breakpoint
CREATE INDEX "evidence_packs_deal_idx" ON "evidence_packs" USING btree ("deal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_cards_deal_version_idx" ON "item_cards" USING btree ("deal_id","version");--> statement-breakpoint
CREATE INDEX "messages_deal_channel_at_idx" ON "messages" USING btree ("deal_id","channel","at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_paypal_order_id_idx" ON "payments" USING btree ("paypal_order_id");--> statement-breakpoint
CREATE INDEX "payments_deal_idx" ON "payments" USING btree ("deal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_deal_idx" ON "shipments" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "verdicts_deal_kind_idx" ON "verdicts" USING btree ("deal_id","kind");