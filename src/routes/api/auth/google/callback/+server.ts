import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { exchangeCode } from '$server/gmail/oauth.js';
import { runMigrations } from '$server/db/migrate.js';

// Ensure DB is ready on first OAuth callback
let migrated = false;

export const GET: RequestHandler = async ({ url, cookies }) => {
  if (!migrated) {
    runMigrations();
    migrated = true;
  }

  const code = url.searchParams.get('code');
  if (!code) throw redirect(302, '/?error=no_code');

  try {
    const userId = await exchangeCode(code);
    cookies.set('spent_uid', userId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: false,           // localhost dev — set true in prod
      maxAge: 60 * 60 * 24 * 30,
    });
    throw redirect(302, '/');
  } catch (err) {
    if ((err as { status?: number })?.status === 302) throw err;
    const msg = encodeURIComponent(String((err as Error)?.message ?? err).slice(0, 200));
    console.error('[auth callback]', err);
    throw redirect(302, `/?error=${msg}`);
  }
};
