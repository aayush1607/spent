import { getDb } from '../client.js';

export interface OAuthTokenRow {
  userId: string;
  email: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiryDate: number | null;
  scope: string | null;
  tokenType: string | null;
  updatedAt: number;
}

export function getToken(userId: string): OAuthTokenRow | null {
  const row = getDb().prepare('SELECT * FROM oauth_tokens WHERE user_id = ?').get(userId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    userId: row.user_id as string,
    email: row.email as string | null,
    accessToken: row.access_token as string,
    refreshToken: row.refresh_token as string | null,
    expiryDate: row.expiry_date as number | null,
    scope: row.scope as string | null,
    tokenType: row.token_type as string | null,
    updatedAt: row.updated_at as number,
  };
}

export function upsertToken(t: OAuthTokenRow): void {
  getDb().prepare(`
    INSERT INTO oauth_tokens
      (user_id, email, access_token, refresh_token, expiry_date, scope, token_type, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      email         = excluded.email,
      access_token  = excluded.access_token,
      refresh_token = COALESCE(excluded.refresh_token, refresh_token),
      expiry_date   = excluded.expiry_date,
      scope         = excluded.scope,
      token_type    = excluded.token_type,
      updated_at    = excluded.updated_at
  `).run(t.userId, t.email, t.accessToken, t.refreshToken, t.expiryDate, t.scope, t.tokenType, t.updatedAt);
}

export function deleteToken(userId: string): void {
  getDb().prepare('DELETE FROM oauth_tokens WHERE user_id = ?').run(userId);
}
