CREATE TYPE "public"."recipient_classification" AS ENUM('UNKNOWN', 'ONE_TIME', 'EMPLOYEE', 'FREELANCER', 'FIRED');--> statement-breakpoint
CREATE TABLE "recipient_wallets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "recipient_wallets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"address" varchar(64) NOT NULL,
	"classification" "recipient_classification" DEFAULT 'UNKNOWN' NOT NULL,
	"first_seen_at" timestamp NOT NULL,
	"last_payment_at" timestamp NOT NULL,
	"total_payments" integer DEFAULT 1 NOT NULL,
	"last_amount" varchar(78),
	"hired_at" timestamp,
	"fired_at" timestamp,
	"months_without_payment" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "recipient_wallets_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE "monthly_positions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "monthly_positions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"recipient_wallet_id" integer NOT NULL,
	"year_month" varchar(7) NOT NULL,
	"position" integer NOT NULL,
	"transaction_hash" varchar(64) NOT NULL,
	"amount" varchar(78) NOT NULL,
	"payment_timestamp" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_recipient_month" UNIQUE("recipient_wallet_id","year_month")
);
--> statement-breakpoint
CREATE TABLE "salary_history" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "salary_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"recipient_wallet_id" integer NOT NULL,
	"previous_amount" varchar(78) NOT NULL,
	"new_amount" varchar(78) NOT NULL,
	"change_percent" numeric(10, 2) NOT NULL,
	"detected_at" timestamp NOT NULL,
	"transaction_hash" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "monthly_positions" ADD CONSTRAINT "monthly_positions_recipient_wallet_id_recipient_wallets_id_fk" FOREIGN KEY ("recipient_wallet_id") REFERENCES "public"."recipient_wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_history" ADD CONSTRAINT "salary_history_recipient_wallet_id_recipient_wallets_id_fk" FOREIGN KEY ("recipient_wallet_id") REFERENCES "public"."recipient_wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_salary_history_recipient" ON "salary_history" USING btree ("recipient_wallet_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_from_address" ON "transactions" USING btree ("from_address");