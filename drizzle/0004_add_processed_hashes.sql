DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'monthly_positions'
        AND column_name = 'processed_transaction_hashes'
    ) THEN
        ALTER TABLE "monthly_positions" ADD COLUMN "processed_transaction_hashes" jsonb DEFAULT '[]'::jsonb;
    END IF;
END $$;