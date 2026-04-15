import { getDb } from '../client.js';

export interface SenderFilter {
  id: number;
  userId: string;
  email: string;
  label: string | null;
  parserId: string | null;
  enabled: boolean;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Defaults — seeded once per user on first use
// parser_id null means DeepSeek generic fallback
// ---------------------------------------------------------------------------
export const DEFAULT_SENDER_FILTERS: Array<{ email: string; label: string; parserId: string | null }> = [
  // Rapido
  { email: 'partner@rapido.bike',                   label: 'Rapido',    parserId: 'rapido' },
  { email: 'noreply@rapido.bike',                    label: 'Rapido',    parserId: 'rapido' },
  { email: 'support@rapido.bike',                    label: 'Rapido',    parserId: 'rapido' },
  // Amazon
  { email: 'order-update@amazon.in',                 label: 'Amazon',    parserId: 'amazon' },
  { email: 'shipment-tracking@amazon.in',            label: 'Amazon',    parserId: 'amazon' },
  { email: 'auto-confirm@amazon.in',                 label: 'Amazon',    parserId: 'amazon' },
  { email: 'invoice@amazon.in',                      label: 'Amazon',    parserId: 'amazon' },
  // Swiggy
  { email: 'noreply@swiggy.in',                      label: 'Swiggy',    parserId: 'swiggy' },
  { email: 'no-reply@swiggy.in',                     label: 'Swiggy',    parserId: 'swiggy' },
  { email: 'order@swiggy.in',                        label: 'Swiggy',    parserId: 'swiggy' },
  // Zomato
  { email: 'noreply@zomato.com',                     label: 'Zomato',    parserId: 'zomato' },
  { email: 'no-reply@zomato.com',                    label: 'Zomato',    parserId: 'zomato' },
  { email: 'orders@zomato.com',                      label: 'Zomato',    parserId: 'zomato' },
  // Cleartrip
  { email: 'no-reply@cleartrip.com',                 label: 'Cleartrip', parserId: 'cleartrip' },
  { email: 'noreply@cleartrip.com',                  label: 'Cleartrip', parserId: 'cleartrip' },
  { email: 'noreply-b2b@cleartrip.com',              label: 'Cleartrip', parserId: 'cleartrip' },
  { email: 'support@cleartrip.com',                  label: 'Cleartrip', parserId: 'cleartrip' },
  // IndiGo
  { email: 'reservations@customer.goindigo.in',      label: 'IndiGo',    parserId: 'indigo' },
  { email: 'noreply@goindigo.in',                    label: 'IndiGo',    parserId: 'indigo' },
  { email: 'customercare@goindigo.in',               label: 'IndiGo',    parserId: 'indigo' },
  // Uber
  { email: 'noreply@uber.com',                       label: 'Uber',      parserId: 'uber' },
  { email: 'uber.india@uber.com',                    label: 'Uber',      parserId: 'uber' },
  // Anthropic — DeepSeek fallback
  { email: 'invoice+statements@mail.anthropic.com',  label: 'Anthropic', parserId: null },
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function rowToFilter(row: Record<string, unknown>): SenderFilter {
  return {
    id:        row.id as number,
    userId:    row.user_id as string,
    email:     row.email as string,
    label:     row.label as string | null,
    parserId:  row.parser_id as string | null,
    enabled:   (row.enabled as number) === 1,
    createdAt: row.created_at as number,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
export function getSenderFilters(userId: string): SenderFilter[] {
  const rows = getDb()
    .prepare('SELECT * FROM sender_filters WHERE user_id = ? ORDER BY label, email')
    .all(userId) as Record<string, unknown>[];
  return rows.map(rowToFilter);
}

/** Inserts defaults for this user, skipping rows that already exist. Safe to call on every request. */
export function seedDefaultFilters(userId: string): void {
  const db  = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO sender_filters (user_id, email, label, parser_id, enabled, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
  `);
  const now = Date.now();
  const run = db.transaction(() => {
    for (const f of DEFAULT_SENDER_FILTERS) {
      stmt.run(userId, f.email.toLowerCase(), f.label, f.parserId, now);
    }
  });
  run();
}

export function upsertSenderFilter(
  userId: string,
  email: string,
  label: string | null,
  parserId: string | null,
): SenderFilter {
  const db         = getDb();
  const normalised = email.toLowerCase().trim();
  db.prepare(`
    INSERT INTO sender_filters (user_id, email, label, parser_id, enabled, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
    ON CONFLICT(user_id, email) DO UPDATE SET
      label     = excluded.label,
      parser_id = excluded.parser_id
  `).run(userId, normalised, label, parserId, Date.now());
  const row = db.prepare(
    'SELECT * FROM sender_filters WHERE user_id = ? AND email = ?'
  ).get(userId, normalised) as Record<string, unknown>;
  return rowToFilter(row);
}

export function toggleSenderFilter(userId: string, id: number, enabled: boolean): void {
  getDb()
    .prepare('UPDATE sender_filters SET enabled = ? WHERE id = ? AND user_id = ?')
    .run(enabled ? 1 : 0, id, userId);
}

export function deleteSenderFilter(userId: string, id: number): void {
  getDb()
    .prepare('DELETE FROM sender_filters WHERE id = ? AND user_id = ?')
    .run(id, userId);
}

/**
 * Returns a Map of lowercased email address → parser_id (null = DeepSeek fallback).
 * Only includes enabled filters.
 */
export function buildEmailToParserMap(userId: string): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const f of getSenderFilters(userId)) {
    if (f.enabled) map.set(f.email.toLowerCase(), f.parserId);
  }
  return map;
}
