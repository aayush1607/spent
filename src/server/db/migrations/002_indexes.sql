CREATE INDEX IF NOT EXISTS idx_txn_user_date     ON transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_txn_category       ON transactions(user_id, category, date);
CREATE INDEX IF NOT EXISTS idx_txn_source         ON transactions(user_id, source, date);
CREATE INDEX IF NOT EXISTS idx_txn_merchant       ON transactions(user_id, merchant);
CREATE INDEX IF NOT EXISTS idx_sync_attempts_user ON sync_attempts(user_id, attempted_at DESC);
