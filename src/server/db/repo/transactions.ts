import { createHash } from 'crypto';
import { getDb } from '../client.js';

export type Category =
  | 'food'
  | 'shopping'
  | 'travel'
  | 'transport'
  | 'bills'
  | 'entertainment'
  | 'other';

export interface Transaction {
  id: string;
  userId: string;
  emailId: string;
  threadId: string | null;
  date: string;
  merchant: string;
  amount: number;
  currency: string;
  category: Category;
  source: string;
  detailsJson: string | null;
  subject: string | null;
  fromAddr: string | null;
  snippet: string | null;
  parsedAt: number;
}

export type NewTransaction = Omit<Transaction, 'id' | 'parsedAt'>;

export function txnId(emailId: string, idx = 0): string {
  return createHash('sha1').update(`${emailId}:${idx}`).digest('hex').slice(0, 16);
}

const INSERT_SQL = `
  INSERT INTO transactions
    (id, user_id, email_id, thread_id, date, merchant, amount, currency,
     category, source, details_json, subject, from_addr, snippet, parsed_at)
  VALUES
    (@id, @userId, @emailId, @threadId, @date, @merchant, @amount, @currency,
     @category, @source, @detailsJson, @subject, @fromAddr, @snippet, @parsedAt)
  ON CONFLICT(user_id, email_id, merchant, amount, date) DO UPDATE SET
    category     = excluded.category,
    details_json = excluded.details_json,
    snippet      = excluded.snippet,
    parsed_at    = excluded.parsed_at
`;

export function upsertTransactions(txns: NewTransaction[]): number {
  const db = getDb();
  const stmt = db.prepare(INSERT_SQL);
  const now = Date.now();
  let count = 0;
  const run = db.transaction(() => {
    for (const t of txns) {
      stmt.run({ ...t, id: txnId(t.emailId), parsedAt: now });
      count++;
    }
  });
  run();
  return count;
}

export function deleteTransactionsBySource(userId: string, source: string): number {
  const result = getDb()
    .prepare('DELETE FROM transactions WHERE user_id = ? AND source = ?')
    .run(userId, source);
  return result.changes;
}

/** Wipes all transactions for a user. Used at the start of a nuclear full sync. */
export function clearAllTransactions(userId: string): void {
  getDb().prepare('DELETE FROM transactions WHERE user_id = ?').run(userId);
}

export interface TxnFilter {
  userId: string;
  from?: string;
  to?: string;
  category?: string[];
  source?: string[];
  merchant?: string;
  minAmount?: number;
  maxAmount?: number;
  q?: string;
  limit?: number;
  offset?: number;
  sort?: 'date' | 'amount';
  dir?: 'asc' | 'desc';
}

export function queryTransactions(f: TxnFilter): { items: Transaction[]; total: number } {
  const db = getDb();
  const conditions: string[] = ['user_id = ?'];
  const params: unknown[] = [f.userId];

  if (f.from)    { conditions.push('date >= ?'); params.push(f.from); }
  if (f.to)      { conditions.push('date <= ?'); params.push(f.to); }
  if (f.category?.length) {
    conditions.push(`category IN (${f.category.map(() => '?').join(',')})`);
    params.push(...f.category);
  }
  if (f.source?.length) {
    conditions.push(`source IN (${f.source.map(() => '?').join(',')})`);
    params.push(...f.source);
  }
  if (f.merchant) { conditions.push('merchant LIKE ?'); params.push(`%${f.merchant}%`); }
  if (f.minAmount != null) { conditions.push('amount >= ?'); params.push(f.minAmount); }
  if (f.maxAmount != null) { conditions.push('amount <= ?'); params.push(f.maxAmount); }
  if (f.q)       { conditions.push('(merchant LIKE ? OR snippet LIKE ?)'); params.push(`%${f.q}%`, `%${f.q}%`); }

  const where = conditions.join(' AND ');
  const sort = f.sort === 'amount' ? 'amount' : 'date';
  const dir = f.dir === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(f.limit ?? 100, 500);
  const offset = f.offset ?? 0;

  const total = (db.prepare(`SELECT COUNT(*) as n FROM transactions WHERE ${where}`).get(...params) as { n: number }).n;
  const items = db.prepare(
    `SELECT * FROM transactions WHERE ${where} ORDER BY ${sort} ${dir} LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as Transaction[];

  return { items, total };
}

export interface AggFilter {
  userId: string;
  from: string;
  to: string;
}

export function sumByCategory(f: AggFilter) {
  return getDb().prepare(`
    SELECT category, SUM(amount) as amount, COUNT(*) as count
    FROM transactions
    WHERE user_id = ? AND date >= ? AND date <= ?
    GROUP BY category ORDER BY amount DESC
  `).all(f.userId, f.from, f.to) as { category: string; amount: number; count: number }[];
}

export function sumBySource(f: AggFilter) {
  return getDb().prepare(`
    SELECT source, SUM(amount) as amount, COUNT(*) as count
    FROM transactions
    WHERE user_id = ? AND date >= ? AND date <= ?
    GROUP BY source ORDER BY amount DESC
  `).all(f.userId, f.from, f.to) as { source: string; amount: number; count: number }[];
}

export function sumByWeek(f: AggFilter) {
  return getDb().prepare(`
    SELECT strftime('%Y-W%W', date) as week, SUM(amount) as amount
    FROM transactions
    WHERE user_id = ? AND date >= ? AND date <= ?
    GROUP BY week ORDER BY week ASC
  `).all(f.userId, f.from, f.to) as { week: string; amount: number }[];
}

export function sumByWeekCategory(f: AggFilter) {
  return getDb().prepare(`
    SELECT strftime('%Y-W%W', date) as week, category, SUM(amount) as amount
    FROM transactions
    WHERE user_id = ? AND date >= ? AND date <= ?
    GROUP BY week, category ORDER BY week ASC
  `).all(f.userId, f.from, f.to) as { week: string; category: string; amount: number }[];
}

export function topMerchants(f: AggFilter, limit = 10) {
  return getDb().prepare(`
    SELECT merchant, SUM(amount) as amount, COUNT(*) as count
    FROM transactions
    WHERE user_id = ? AND date >= ? AND date <= ?
    GROUP BY merchant ORDER BY amount DESC LIMIT ?
  `).all(f.userId, f.from, f.to, limit) as { merchant: string; amount: number; count: number }[];
}

export function totalSpend(f: AggFilter): number {
  const row = getDb().prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM transactions
    WHERE user_id = ? AND date >= ? AND date <= ?
  `).get(f.userId, f.from, f.to) as { total: number };
  return row.total;
}
