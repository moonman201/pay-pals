CREATE TYPE "public"."scenario_new" AS ENUM('scam-ps5', 'clean-ps5', 'empty-box');--> statement-breakpoint
ALTER TABLE "deals" ALTER COLUMN "scenario" SET DATA TYPE "public"."scenario_new" USING (
  CASE "scenario"::text
    WHEN 'scam-garmin' THEN 'scam-ps5'
    WHEN 'clean-garmin' THEN 'clean-ps5'
    WHEN 'wrong-item' THEN 'empty-box'
    ELSE "scenario"::text
  END
)::"public"."scenario_new";--> statement-breakpoint
DROP TYPE "public"."scenario";--> statement-breakpoint
ALTER TYPE "public"."scenario_new" RENAME TO "scenario";
