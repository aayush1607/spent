import { fileURLToPath } from 'url';
import { getDb } from './client.js';

// SQL inlined so the build has no runtime filesystem dependency on .sql files
const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: '001_init.sql',
    sql: `
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
);`,
  },
  {
    name: '002_indexes.sql',
    sql: `
CREATE INDEX IF NOT EXISTS idx_txn_user_date     ON transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_txn_category       ON transactions(user_id, category, date);
CREATE INDEX IF NOT EXISTS idx_txn_source         ON transactions(user_id, source, date);
CREATE INDEX IF NOT EXISTS idx_txn_merchant       ON transactions(user_id, merchant);
CREATE INDEX IF NOT EXISTS idx_sync_attempts_user ON sync_attempts(user_id, attempted_at DESC);`,
  },
  {
    name: '003_sender_filters.sql',
    sql: `
CREATE TABLE IF NOT EXISTS sender_filters (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  email      TEXT NOT NULL,
  label      TEXT,
  parser_id  TEXT,
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, email)
);`,
  },
];

export function runMigrations(): void {
  const db = getDb();

  // Bootstrap: create _migrations table if it doesn't exist yet
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);

  const applied = new Set(
    (db.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map(
      (r) => r.name
    )
  );

  for (const { name, sql } of MIGRATIONS) {
    if (applied.has(name)) continue;
    db.exec(sql);
    db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(name, Date.now());
    console.log(`[migrate] applied: ${name}`);
  }
}

// Allow running directly: tsx src/server/db/migrate.ts
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations();
  console.log('[migrate] done');
}
