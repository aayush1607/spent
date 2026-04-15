CREATE TABLE IF NOT EXISTS sender_filters (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  email      TEXT NOT NULL,
  label      TEXT,
  parser_id  TEXT,          -- matches Parser.id; NULL = DeepSeek fallback
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, email)
);
