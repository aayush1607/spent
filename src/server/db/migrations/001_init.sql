CREATE TABLE IF NOT EXISTS _migrations (
  name       TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  user_id       TEXT PRIMARY KEY,
  email         TEXT,
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  expiry_date   INTEGER,
  scope         TEXT,
  token_type    TEXT,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  email_id     TEXT NOT NULL,
  thread_id    TEXT,
  date         TEXT NOT NULL,
  merchant     TEXT NOT NULL,
  amount       REAL NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'INR',
  category     TEXT NOT NULL,
  source       TEXT NOT NULL,
  details_json TEXT,
  subject      TEXT,
  from_addr    TEXT,
  snippet      TEXT,
  parsed_at    INTEGER NOT NULL,
  UNIQUE(user_id, email_id, merchant, amount, date)
);

CREATE TABLE IF NOT EXISTS sync_state (
  user_id         TEXT PRIMARY KEY,
  last_history_id TEXT,
  last_full_sync  INTEGER,
  last_sync_at    INTEGER,
  status          TEXT
);

CREATE TABLE IF NOT EXISTS sync_attempts (
  email_id     TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  parser_tried TEXT,
  status       TEXT,
  error        TEXT,
  attempted_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS extraction_cache (
  email_id    TEXT PRIMARY KEY,
  result_json TEXT,
  created_at  INTEGER NOT NULL
);
