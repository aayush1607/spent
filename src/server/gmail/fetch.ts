import type { gmail_v1 } from 'googleapis';
import { getGmailClient } from './client.js';

const BACKOFF = [500, 2000, 8000];

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= BACKOFF.length; i++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      const status = (err as { status?: number; code?: number })?.status ?? (err as { code?: number })?.code;
      if (status && (status === 429 || status >= 500) && i < BACKOFF.length) {
        await new Promise((r) => setTimeout(r, BACKOFF[i]));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function listMessageIds(
  userId: string,
  query: string,
  maxResults = 500
): Promise<string[]> {
  const gmail = await getGmailClient(userId);
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const res = await withRetry(() =>
      gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: Math.min(maxResults - ids.length, 100),
        pageToken,
      })
    );
    for (const m of res.data.messages ?? []) {
      if (m.id) ids.push(m.id);
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken && ids.length < maxResults);

  return ids;
}

export async function getMessage(
  userId: string,
  messageId: string
): Promise<gmail_v1.Schema$Message> {
  const gmail = await getGmailClient(userId);
  const res = await withRetry(() =>
    gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    })
  );
  return res.data;
}

export async function getMessagesBatch(
  userId: string,
  messageIds: string[],
  concurrency = 5
): Promise<gmail_v1.Schema$Message[]> {
  const results: gmail_v1.Schema$Message[] = [];
  for (let i = 0; i < messageIds.length; i += concurrency) {
    const chunk = messageIds.slice(i, i + concurrency);
    const fetched = await Promise.all(chunk.map((id) => getMessage(userId, id)));
    results.push(...fetched);
  }
  return results;
}

export async function getHistoryId(userId: string): Promise<string> {
  const gmail = await getGmailClient(userId);
  const res = await gmail.users.getProfile({ userId: 'me' });
  return res.data.historyId ?? '0';
}

export async function listNewMessageIds(
  userId: string,
  startHistoryId: string
): Promise<{ ids: string[]; newHistoryId: string } | null> {
  const gmail = await getGmailClient(userId);
  try {
    const res = await withRetry(() =>
      gmail.users.history.list({
        userId: 'me',
        startHistoryId,
        historyTypes: ['messageAdded'],
      })
    );
    const ids: string[] = [];
    for (const h of res.data.history ?? []) {
      for (const m of h.messagesAdded ?? []) {
        if (m.message?.id) ids.push(m.message.id);
      }
    }
    return { ids, newHistoryId: res.data.historyId ?? startHistoryId };
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    if (status === 404) return null; // historyId expired
    throw err;
  }
}
