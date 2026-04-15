import { getDb } from '../client.js';
import type { ParsedTxn } from '../../parsers/types.js';

export function getCached(emailId: string): ParsedTxn[] | null {
  const row = getDb().prepare('SELECT result_json FROM extraction_cache WHERE email_id = ?').get(emailId) as { result_json: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.result_json);
  } catch {
    return null;
  }
}

export function setCache(emailId: string, result: ParsedTxn[]): void {
  getDb().prepare(`
    INSERT INTO extraction_cache (email_id, result_json, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(email_id) DO UPDATE SET result_json = excluded.result_json
  `).run(emailId, JSON.stringify(result), Date.now());
}

/** Removes cached results for emails whose extracted transactions came from deepseek_generic.
 *  Call this after updating the prompt so the next full sync re-extracts them. */
export function clearDeepSeekCache(userId: string): number {
  const result = getDb().prepare(`
    DELETE FROM extraction_cache
    WHERE email_id IN (
      SELECT email_id FROM sync_attempts
      WHERE user_id = ? AND parser_tried = 'deepseek_generic'
    )
  `).run(userId);
  // Also clear their sync_attempts so they get re-evaluated
  getDb().prepare(`
    DELETE FROM sync_attempts
    WHERE user_id = ? AND parser_tried = 'deepseek_generic'
  `).run(userId);
  return result.changes;
}

/** Wipes the entire extraction cache for a user. Used before a nuclear full-sync reset. */
export function clearAllCache(userId: string): void {
  getDb().prepare(`
    DELETE FROM extraction_cache
    WHERE email_id IN (
      SELECT email_id FROM sync_attempts WHERE user_id = ?
    )
  `).run(userId);
}
