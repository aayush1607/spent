import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getToken } from '$server/db/repo/oauthTokens.js';
import { getSyncState } from '$server/db/repo/syncState.js';

export const GET: RequestHandler = ({ cookies }) => {
  const userId = cookies.get('spent_uid');
  if (!userId) return json({ connected: false });

  const token = getToken(userId);
  if (!token) return json({ connected: false });

  const syncState = getSyncState(userId);
  return json({
    connected: true,
    email: token.email,
    lastSyncAt: syncState?.lastSyncAt ?? null,
  });
};

export const DELETE: RequestHandler = ({ cookies }) => {
  cookies.delete('spent_uid', { path: '/' });
  return json({ ok: true });
};
