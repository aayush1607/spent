import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import {
  getSenderFilters,
  seedDefaultFilters,
  upsertSenderFilter,
  toggleSenderFilter,
  deleteSenderFilter,
} from '$server/db/repo/senderFilters.js';

// GET /api/filters — list all filters for the authenticated user
export const GET: RequestHandler = ({ cookies }) => {
  const userId = cookies.get('spent_uid');
  if (!userId) return json({ error: 'not authenticated' }, { status: 401 });

  seedDefaultFilters(userId); // no-op after first call
  return json(getSenderFilters(userId));
};

// POST /api/filters — add or update a filter
// Body: { email: string, label?: string, parserId?: string | null }
export const POST: RequestHandler = async ({ cookies, request }) => {
  const userId = cookies.get('spent_uid');
  if (!userId) return json({ error: 'not authenticated' }, { status: 401 });

  const body = await request.json() as Record<string, unknown>;
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!email) return json({ error: 'email is required' }, { status: 400 });

  // Basic email format validation
  if (!/^[\w.+%-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(email)) {
    return json({ error: 'invalid email address' }, { status: 400 });
  }

  const label    = typeof body.label    === 'string' ? body.label.trim()    : null;
  const parserId = typeof body.parserId === 'string' ? body.parserId.trim() : null;

  const filter = upsertSenderFilter(userId, email, label || null, parserId || null);
  return json(filter, { status: 201 });
};

// PATCH /api/filters — toggle enabled state
// Body: { id: number, enabled: boolean }
export const PATCH: RequestHandler = async ({ cookies, request }) => {
  const userId = cookies.get('spent_uid');
  if (!userId) return json({ error: 'not authenticated' }, { status: 401 });

  const body = await request.json() as Record<string, unknown>;
  if (typeof body.id !== 'number' || typeof body.enabled !== 'boolean') {
    return json({ error: 'id (number) and enabled (boolean) are required' }, { status: 400 });
  }

  toggleSenderFilter(userId, body.id, body.enabled);
  return json({ ok: true });
};

// DELETE /api/filters?id=<number> — remove a filter
export const DELETE: RequestHandler = ({ cookies, url }) => {
  const userId = cookies.get('spent_uid');
  if (!userId) return json({ error: 'not authenticated' }, { status: 401 });

  const id = Number(url.searchParams.get('id'));
  if (!id || isNaN(id)) return json({ error: 'valid id parameter required' }, { status: 400 });

  deleteSenderFilter(userId, id);
  return json({ ok: true });
};
