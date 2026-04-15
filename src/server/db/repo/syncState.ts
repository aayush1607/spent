import { getDb } from '../client.js';

export interface SyncState {
  userId: string;
  lastHistoryId: string | null;
  lastFullSync: number | null;
  lastSyncAt: number | null;
  status: string | null;
}

export function getSyncState(userId: string): SyncState | null {
  const row = getDb().prepare('SELECT * FROM sync_state WHERE user_id = ?').get(userId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    userId: row.user_id as string,
    lastHistoryId: row.last_history_id as string | null,
    lastFullSync: row.last_full_sync as number | null,
    lastSyncAt: row.last_sync_at as number | null,
    status: row.status as string | null,
  };
}

export function upsertSyncState(s: Partial<SyncState> & { userId: string }): void {
  getDb().prepare(`
    INSERT INTO sync_state (user_id, last_history_id, last_full_sync, last_sync_at, status)
    VALUES (@userId, @lastHistoryId, @lastFullSync, @lastSyncAt, @status)
    ON CONFLICT(user_id) DO UPDATE SET
      last_history_id = COALESCE(@lastHistoryId, last_history_id),
      last_full_sync  = COALESCE(@lastFullSync, last_full_sync),
      last_sync_at    = COALESCE(@lastSyncAt, last_sync_at),
      status          = COALESCE(@status, status)
  `).run({
    userId: s.userId,
    lastHistoryId: s.lastHistoryId ?? null,
    lastFullSync: s.lastFullSync ?? null,
    lastSyncAt: s.lastSyncAt ?? null,
    status: s.status ?? null,
  });
}

export function recordSyncAttempt(
  userId: string,
  emailId: string,
  parserTried: string | null,
  status: 'parsed' | 'unparsed' | 'error' | 'skipped',
  error?: string
): void {
  getDb().prepare(`
    INSERT INTO sync_attempts (email_id, user_id, parser_tried, status, error, attempted_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(email_id) DO UPDATE SET
      status       = excluded.status,
      error        = excluded.error,
      attempted_at = excluded.attempted_at
  `).run(emailId, userId, parserTried, status, error ?? null, Date.now());
}

export function isAlreadyAttempted(emailId: string): boolean {
  const row = getDb().prepare('SELECT 1 FROM sync_attempts WHERE email_id = ?').get(emailId);
  return !!row;
}

/** Stricter version — only skips emails that were successfully parsed. Used by full sync so
 *  unparsed/error emails are retried after adding new sender addresses or parsers. */
export function isAlreadyParsed(emailId: string): boolean {
  const row = getDb().prepare("SELECT 1 FROM sync_attempts WHERE email_id = ? AND status = 'parsed'").get(emailId);
  return !!row;
}

/** Clears all sync attempt records for a user. Used at the start of a nuclear full sync. */
export function clearAllSyncAttempts(userId: string): void {
  getDb().prepare('DELETE FROM sync_attempts WHERE user_id = ?').run(userId);
}
