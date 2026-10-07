CREATE TYPE "public"."deal_starter" AS ENUM('buyer', 'seller');--> statement-breakpoint
ALTER TYPE "public"."deal_event_kind" ADD VALUE 'seller_invited' BEFORE 'card_updated';--> statement-breakpoint
ALTER TYPE "public"."deal_event_kind" ADD VALUE 'seller_joined' BEFORE 'card_updated';--> statement-breakpoint
ALTER TYPE "public"."deal_event_kind" ADD VALUE 'invite_declined' BEFORE 'card_updated';--> statement-breakpoint
ALTER TYPE "public"."deal_state" ADD VALUE 'INVITED' BEFORE 'LISTED';--> statement-breakpoint
CREATE TYPE "public"."scenario_new" AS ENUM('fake-slab', 'clean-ps5', 'empty-box');--> statement-breakpoint
ALTER TABLE "deals" ALTER COLUMN "scenario" SET DATA TYPE "public"."scenario_new" USING (
  CASE "scenario"::text
    WHEN 'scam-ps5' THEN 'fake-slab'
    ELSE "scenario"::text
  END
)::"public"."scenario_new";--> statement-breakpoint
DROP TYPE "public"."scenario";--> statement-breakpoint
ALTER TYPE "public"."scenario_new" RENAME TO "scenario";--> statement-breakpoint
ALTER TABLE "deal_events" ADD COLUMN "prev_hash" text;--> statement-breakpoint
ALTER TABLE "deal_events" ADD COLUMN "hash" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "started_by" "deal_starter" DEFAULT 'seller' NOT NULL;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "listing_url" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "seller_joined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "item_cards" ADD COLUMN "box_serial" text;--> statement-breakpoint
ALTER TABLE "item_cards" ADD COLUMN "cert_number" text;--> statement-breakpoint
ALTER TABLE "item_cards" ADD COLUMN "grade" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "history_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "deal_events_hash_idx" ON "deal_events" USING btree ("hash");
