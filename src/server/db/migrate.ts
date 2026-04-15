import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from './client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

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

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    db.exec(sql);
    db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(
      file,
      Date.now()
    );
    console.log(`[migrate] applied: ${file}`);
  }
}

// Allow running directly: tsx src/server/db/migrate.ts
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations();
  console.log('[migrate] done');
}
