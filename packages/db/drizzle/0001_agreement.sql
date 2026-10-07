ALTER TYPE "public"."deal_event_kind" ADD VALUE 'agreed' BEFORE 'card_locked';--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "buyer_agreed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "seller_agreed_at" timestamp with time zone;