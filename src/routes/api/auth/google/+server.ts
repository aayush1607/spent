import { redirect } from '@sveltejs/kit';
import { getAuthUrl } from '$server/gmail/oauth.js';

export function GET() {
  throw redirect(302, getAuthUrl());
}
