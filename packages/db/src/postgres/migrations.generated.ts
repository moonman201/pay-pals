/**
 * GENERATED FILE. Do not edit. Source of truth: packages/db/drizzle.
 * Regenerate with: npm run db:bundle -w packages/db
 * (npm run db:generate does both drizzle-kit generate and this step.)
 */
import type { BundledMigration } from "./migrations-source";

export const MIGRATIONS: readonly BundledMigration[] = [
  {
    "tag": "0000_init",
    "sql": [
      "CREATE TYPE \"public\".\"actor\" AS ENUM('buyer', 'seller', 'buyer_pal', 'seller_pal', 'system', 'paypal');",
      "\nCREATE TYPE \"public\".\"carrier\" AS ENUM('USPS', 'UPS', 'FedEx', 'DHL', 'Other');",
      "\nCREATE TYPE \"public\".\"condition_grade\" AS ENUM('new', 'like_new', 'good', 'fair', 'for_parts');",
      "\nCREATE TYPE \"public\".\"deal_event_kind\" AS ENUM('deal_created', 'card_updated', 'review_posted', 'card_locked', 'state_changed', 'payment_created', 'payment_captured', 'shipped', 'delivered', 'arrival_checked', 'evidence_built', 'dispute_opened');",
      "\nCREATE TYPE \"public\".\"deal_state\" AS ENUM('DRAFT', 'LISTED', 'REVIEWED', 'AGREED', 'PAYMENT_PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'COMPLETE', 'BLOCKED', 'ISSUE', 'CANCELLED');",
      "\nCREATE TYPE \"public\".\"message_channel\" AS ENUM('deal', 'buyer_pal', 'seller_pal');",
      "\nCREATE TYPE \"public\".\"payment_method\" AS ENUM('paypal', 'venmo');",
      "\nCREATE TYPE \"public\".\"payment_status\" AS ENUM('CREATED', 'APPROVED', 'CAPTURED', 'FAILED', 'DISPUTED');",
      "\nCREATE TYPE \"public\".\"scenario\" AS ENUM('scam-garmin', 'clean-garmin', 'wrong-item');",
      "\nCREATE TYPE \"public\".\"verdict_kind\" AS ENUM('review', 'arrival');",
      "\nCREATE TABLE \"deal_events\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"deal_id\" uuid NOT NULL,\n\t\"kind\" \"deal_event_kind\" NOT NULL,\n\t\"actor\" \"actor\" NOT NULL,\n\t\"summary\" text NOT NULL,\n\t\"from_state\" \"deal_state\",\n\t\"to_state\" \"deal_state\",\n\t\"data\" jsonb,\n\t\"at\" timestamp with time zone DEFAULT now() NOT NULL\n);\n",
      "\nCREATE TABLE \"deals\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"state\" \"deal_state\" DEFAULT 'DRAFT' NOT NULL,\n\t\"scenario\" \"scenario\",\n\t\"seller_name\" text NOT NULL,\n\t\"seller_email\" text NOT NULL,\n\t\"buyer_name\" text,\n\t\"buyer_email\" text,\n\t\"current_card_version\" integer DEFAULT 0 NOT NULL,\n\t\"locked_card_version\" integer,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"updated_at\" timestamp with time zone DEFAULT now() NOT NULL\n);\n",
      "\nCREATE TABLE \"evidence_packs\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"deal_id\" uuid NOT NULL,\n\t\"built_by\" \"actor\" NOT NULL,\n\t\"summary\" text NOT NULL,\n\t\"pack\" jsonb NOT NULL,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL\n);\n",
      "\nCREATE TABLE \"item_cards\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"deal_id\" uuid NOT NULL,\n\t\"version\" integer NOT NULL,\n\t\"title\" text NOT NULL,\n\t\"brand\" text NOT NULL,\n\t\"model\" text NOT NULL,\n\t\"serial\" text,\n\t\"condition_grade\" \"condition_grade\" NOT NULL,\n\t\"condition_notes\" text DEFAULT '' NOT NULL,\n\t\"included\" jsonb DEFAULT '[]'::jsonb NOT NULL,\n\t\"photos\" jsonb DEFAULT '[]'::jsonb NOT NULL,\n\t\"asking_price_cents\" integer NOT NULL,\n\t\"currency\" text DEFAULT 'USD' NOT NULL,\n\t\"seller_paypal_email\" text NOT NULL,\n\t\"locked_at\" timestamp with time zone,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL\n);\n",
      "\nCREATE TABLE \"messages\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"deal_id\" uuid NOT NULL,\n\t\"channel\" \"message_channel\" NOT NULL,\n\t\"author\" \"actor\" NOT NULL,\n\t\"text\" text NOT NULL,\n\t\"photos\" jsonb DEFAULT '[]'::jsonb NOT NULL,\n\t\"at\" timestamp with time zone DEFAULT now() NOT NULL\n);\n",
      "\nCREATE TABLE \"payments\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"deal_id\" uuid NOT NULL,\n\t\"paypal_order_id\" text NOT NULL,\n\t\"capture_id\" text,\n\t\"status\" \"payment_status\" DEFAULT 'CREATED' NOT NULL,\n\t\"payee_email\" text NOT NULL,\n\t\"amount_cents\" integer NOT NULL,\n\t\"currency\" text DEFAULT 'USD' NOT NULL,\n\t\"method\" \"payment_method\",\n\t\"raw_order\" jsonb,\n\t\"raw_capture\" jsonb,\n\t\"captured_at\" timestamp with time zone,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"updated_at\" timestamp with time zone DEFAULT now() NOT NULL\n);\n",
      "\nCREATE TABLE \"shipments\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"deal_id\" uuid NOT NULL,\n\t\"carrier\" \"carrier\" NOT NULL,\n\t\"tracking_number\" text NOT NULL,\n\t\"packing_photos\" jsonb DEFAULT '[]'::jsonb NOT NULL,\n\t\"checklist\" jsonb DEFAULT '[]'::jsonb NOT NULL,\n\t\"shipped_at\" timestamp with time zone NOT NULL,\n\t\"delivered_at\" timestamp with time zone,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL\n);\n",
      "\nCREATE TABLE \"verdicts\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"deal_id\" uuid NOT NULL,\n\t\"kind\" \"verdict_kind\" NOT NULL,\n\t\"card_version\" integer NOT NULL,\n\t\"outcome\" text NOT NULL,\n\t\"payload\" jsonb NOT NULL,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL\n);\n",
      "\nCREATE TABLE \"webhook_receipts\" (\n\t\"event_id\" text PRIMARY KEY NOT NULL,\n\t\"event_type\" text NOT NULL,\n\t\"received_at\" timestamp with time zone DEFAULT now() NOT NULL\n);\n",
      "\nALTER TABLE \"deal_events\" ADD CONSTRAINT \"deal_events_deal_id_deals_id_fk\" FOREIGN KEY (\"deal_id\") REFERENCES \"public\".\"deals\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "\nALTER TABLE \"evidence_packs\" ADD CONSTRAINT \"evidence_packs_deal_id_deals_id_fk\" FOREIGN KEY (\"deal_id\") REFERENCES \"public\".\"deals\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "\nALTER TABLE \"item_cards\" ADD CONSTRAINT \"item_cards_deal_id_deals_id_fk\" FOREIGN KEY (\"deal_id\") REFERENCES \"public\".\"deals\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "\nALTER TABLE \"messages\" ADD CONSTRAINT \"messages_deal_id_deals_id_fk\" FOREIGN KEY (\"deal_id\") REFERENCES \"public\".\"deals\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "\nALTER TABLE \"payments\" ADD CONSTRAINT \"payments_deal_id_deals_id_fk\" FOREIGN KEY (\"deal_id\") REFERENCES \"public\".\"deals\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "\nALTER TABLE \"shipments\" ADD CONSTRAINT \"shipments_deal_id_deals_id_fk\" FOREIGN KEY (\"deal_id\") REFERENCES \"public\".\"deals\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "\nALTER TABLE \"verdicts\" ADD CONSTRAINT \"verdicts_deal_id_deals_id_fk\" FOREIGN KEY (\"deal_id\") REFERENCES \"public\".\"deals\"(\"id\") ON DELETE cascade ON UPDATE no action;",
      "\nCREATE INDEX \"deal_events_deal_at_idx\" ON \"deal_events\" USING btree (\"deal_id\",\"at\");",
      "\nCREATE INDEX \"deals_state_idx\" ON \"deals\" USING btree (\"state\");",
      "\nCREATE INDEX \"evidence_packs_deal_idx\" ON \"evidence_packs\" USING btree (\"deal_id\");",
      "\nCREATE UNIQUE INDEX \"item_cards_deal_version_idx\" ON \"item_cards\" USING btree (\"deal_id\",\"version\");",
      "\nCREATE INDEX \"messages_deal_channel_at_idx\" ON \"messages\" USING btree (\"deal_id\",\"channel\",\"at\");",
      "\nCREATE UNIQUE INDEX \"payments_paypal_order_id_idx\" ON \"payments\" USING btree (\"paypal_order_id\");",
      "\nCREATE INDEX \"payments_deal_idx\" ON \"payments\" USING btree (\"deal_id\");",
      "\nCREATE UNIQUE INDEX \"shipments_deal_idx\" ON \"shipments\" USING btree (\"deal_id\");",
      "\nCREATE INDEX \"verdicts_deal_kind_idx\" ON \"verdicts\" USING btree (\"deal_id\",\"kind\");"
    ],
    "bps": true,
    "folderMillis": 1791344688584,
    "hash": "74ad9776e68748778560c706c32b87b13b1c539e869a80e149fb1d9252467639"
  }
];
