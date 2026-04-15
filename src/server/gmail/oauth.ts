import { google } from 'googleapis';
import { env } from '../config.js';
import { getToken, upsertToken } from '../db/repo/oauthTokens.js';

export const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

export function createOAuth2Client() {
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl(): string {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

export async function exchangeCode(code: string): Promise<string> {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  // Extract email from id_token JWT payload (avoids extra API call)
  let email: string | null = null;
  if (tokens.id_token) {
    try {
      const payload = JSON.parse(
        Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString('utf8')
      );
      email = payload.email ?? null;
    } catch { /* non-fatal */ }
  }
  const userId = 'me';

  upsertToken({
    userId,
    email,
    accessToken: tokens.access_token!,
    refreshToken: tokens.refresh_token ?? null,
    expiryDate: tokens.expiry_date ?? null,
    scope: tokens.scope ?? null,
    tokenType: tokens.token_type ?? null,
    updatedAt: Date.now(),
  });

  return userId;
}

export async function getAuthedClient(userId: string) {
  const tokenRow = getToken(userId);
  if (!tokenRow) throw new Error('No OAuth token — user must connect Gmail first');

  const client = createOAuth2Client();
  client.setCredentials({
    access_token:  tokenRow.accessToken,
    refresh_token: tokenRow.refreshToken,
    expiry_date:   tokenRow.expiryDate,
    scope:         tokenRow.scope ?? undefined,
    token_type:    tokenRow.tokenType ?? undefined,
  });

  // Persist refreshed tokens automatically
  client.on('tokens', (newTokens) => {
    upsertToken({
      userId,
      email: tokenRow.email,
      accessToken: newTokens.access_token ?? tokenRow.accessToken,
      refreshToken: newTokens.refresh_token ?? tokenRow.refreshToken,
      expiryDate: newTokens.expiry_date ?? tokenRow.expiryDate,
      scope: newTokens.scope ?? tokenRow.scope,
      tokenType: newTokens.token_type ?? tokenRow.tokenType,
      updatedAt: Date.now(),
    });
  });

  return client;
}
