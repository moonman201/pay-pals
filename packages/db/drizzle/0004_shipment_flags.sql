ALTER TYPE "public"."deal_event_kind" ADD VALUE 'shipment_checked' BEFORE 'delivered';--> statement-breakpoint
ALTER TABLE "deal_events" ALTER COLUMN "hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "flags" jsonb DEFAULT '[]'::jsonb NOT NULL;