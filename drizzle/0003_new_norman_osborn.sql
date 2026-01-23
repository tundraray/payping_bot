ALTER TABLE "monthly_positions" DROP CONSTRAINT "monthly_positions_recipient_wallet_id_recipient_wallets_id_fk";
--> statement-breakpoint
ALTER TABLE "salary_history" DROP CONSTRAINT "salary_history_recipient_wallet_id_recipient_wallets_id_fk";
--> statement-breakpoint
ALTER TABLE "monthly_positions" ADD CONSTRAINT "monthly_positions_recipient_wallet_id_recipient_wallets_id_fk" FOREIGN KEY ("recipient_wallet_id") REFERENCES "public"."recipient_wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_history" ADD CONSTRAINT "salary_history_recipient_wallet_id_recipient_wallets_id_fk" FOREIGN KEY ("recipient_wallet_id") REFERENCES "public"."recipient_wallets"("id") ON DELETE cascade ON UPDATE no action;