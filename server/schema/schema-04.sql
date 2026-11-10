ALTER TABLE payassure_settlements
  ADD COLUMN IF NOT EXISTS request_fingerprint TEXT;
ALTER TABLE payassure_settlements
  ADD COLUMN IF NOT EXISTS collection_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE payassure_settlements
  ADD COLUMN IF NOT EXISTS provider_settlement_id TEXT;
ALTER TABLE payassure_settlements
  ADD COLUMN IF NOT EXISTS last_event_type TEXT;
ALTER TABLE payassure_settlements
  ADD COLUMN IF NOT EXISTS last_event_payload JSONB;
ALTER TABLE payassure_settlements
  ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMPTZ;
ALTER TABLE payassure_settlements
  DROP CONSTRAINT IF EXISTS payassure_settlements_status_check;
ALTER TABLE payassure_settlements
  ADD CONSTRAINT payassure_settlements_status_check
  CHECK (status IN (
    'queued', 'processing', 'accepted', 'failed', 'retrying', 'partially_failed',
    'awaiting_reconciliation', 'completed'
  ));
ALTER TABLE payassure_settlements
  DROP CONSTRAINT IF EXISTS payassure_settlements_collection_status_check;
ALTER TABLE payassure_settlements
  ADD CONSTRAINT payassure_settlements_collection_status_check
  CHECK (collection_status IN ('pending', 'succeeded', 'failed'));

UPDATE payassure_settlements settlement
SET collection_status = CASE
  WHEN sale.status = 'completed' THEN 'succeeded'
  WHEN sale.status = 'failed' THEN 'failed'
  ELSE settlement.collection_status
END
FROM sales sale
WHERE sale.id = settlement.sale_id
  AND settlement.collection_status = 'pending'
  AND sale.status IN ('completed', 'failed');

CREATE TABLE IF NOT EXISTS payassure_webhook_events (
  id SERIAL PRIMARY KEY,
  recipient_merchant_id TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  delivery_id TEXT,
  payload JSONB NOT NULL,
  signature_valid BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processed', 'duplicate', 'rejected')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  UNIQUE (recipient_merchant_id, provider_event_id)
);

ALTER TABLE payassure_webhook_events
  ADD COLUMN IF NOT EXISTS recipient_merchant_id TEXT;
ALTER TABLE payassure_webhook_events
  DROP CONSTRAINT IF EXISTS payassure_webhook_events_provider_event_id_key;
ALTER TABLE payassure_webhook_events
  DROP CONSTRAINT IF EXISTS payassure_webhook_events_recipient_merchant_id_provider_event_id_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payassure_webhook_events_recipient_event_unique'
      AND conrelid = 'payassure_webhook_events'::regclass
  ) THEN
    ALTER TABLE payassure_webhook_events
      ADD CONSTRAINT payassure_webhook_events_recipient_event_unique
      UNIQUE (recipient_merchant_id, provider_event_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS payassure_webhook_events_type_idx
  ON payassure_webhook_events (event_type, received_at DESC);

CREATE TABLE IF NOT EXISTS payassure_webhook_credentials (
  recipient_merchant_id TEXT PRIMARY KEY,
  encrypted_api_secret TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payassure_settlements_retry_idx
  ON payassure_settlements (next_attempt_at)
  WHERE status IN ('queued', 'failed');
