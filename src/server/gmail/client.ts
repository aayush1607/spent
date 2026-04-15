import { google } from 'googleapis';
import { getAuthedClient } from './oauth.js';

export async function getGmailClient(userId: string) {
  const auth = await getAuthedClient(userId);
  return google.gmail({ version: 'v1', auth });
}
