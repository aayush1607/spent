import { listMessageIds, getMessagesBatch, getHistoryId, listNewMessageIds } from '../gmail/fetch.js';
import { decodeMessage } from '../gmail/decode.js';
import { getParserForDomain, getParserById } from '../parsers/registry.js';
import { extractWithAI, PARSER_BRAND } from '../parsers/generic_deepseek.js';
import { upsertTransactions } from '../db/repo/transactions.js';
import { clearAllTransactions } from '../db/repo/transactions.js';
import { getSyncState, upsertSyncState, recordSyncAttempt, isAlreadyAttempted, isAlreadyParsed, clearAllSyncAttempts } from '../db/repo/syncState.js';
import { clearAllCache } from '../db/repo/extractionCache.js';
import { getSenderFilters, seedDefaultFilters, buildEmailToParserMap } from '../db/repo/senderFilters.js';
import { gmailDateStr, defaultSince } from '../parsers/util.js';
import type { ParserContext, ParsedTxn } from '../parsers/types.js';

export type SyncProgress =
  | { type: 'progress'; phase: string; parser?: string; done?: number; total?: number; count?: number }
  | { type: 'done'; inserted: number; updated: number; skipped: number; historyId?: string }
  | { type: 'error'; message: string };

export type ProgressEmitter = (event: SyncProgress) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build txn row for upsert
// ─────────────────────────────────────────────────────────────────────────────
function toRow(t: ParsedTxn, userId: string) {
  return {
    userId,
    emailId:     t.emailId,
    threadId:    t.threadId,
    date:        t.date,
    merchant:    t.merchant,
    amount:      t.amount,
    currency:    t.currency,
    category:    t.category,
    source:      t.source,
    detailsJson: t.details ? JSON.stringify(t.details) : null,
    subject:     t.subject,
    fromAddr:    t.fromAddr,
    snippet:     t.snippet,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Abort registry — in-memory per-user stop signal
// ─────────────────────────────────────────────────────────────────────────────
const abortRequested = new Set<string>();

export function requestAbort(userId: string): void {
  abortRequested.add(userId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main sync
// ─────────────────────────────────────────────────────────────────────────────
export async function runSync(
  userId: string,
  mode: 'full' | 'incremental',
  emit: ProgressEmitter
): Promise<void> {
  try {
    const state = getSyncState(userId);

    // Mark running immediately so page reloads see the correct status
    await upsertSyncState({ userId, status: 'syncing', lastSyncAt: Date.now() });
    abortRequested.delete(userId); // clear any stale abort from a previous run

    // Ensure default sender filters exist for this user
    seedDefaultFilters(userId);

    const filters       = getSenderFilters(userId).filter((f) => f.enabled);
    const emailToParser = buildEmailToParserMap(userId); // email → parserId | null

    // ── Full sync: nuclear reset ─────────────────────────────────────────────
    // Clears all previous transactions, sync attempts, and AI cache so
    // everything is re-extracted from scratch with the current parsers/prompt.
    if (mode === 'full') {
      emit({ type: 'progress', phase: 'resetting' });
      // Clear cache BEFORE sync_attempts — cache deletion joins on sync_attempts
      clearAllCache(userId);
      clearAllSyncAttempts(userId);
      clearAllTransactions(userId);
    }

    let messageIds: string[] = [];

    // ── Fetch message IDs ────────────────────────────────────────────────────
    if (mode === 'incremental' && state?.lastHistoryId) {
      emit({ type: 'progress', phase: 'fetching_history' });
      const result = await listNewMessageIds(userId, state.lastHistoryId);
      if (result === null) {
        emit({ type: 'progress', phase: 'history_expired_full_sync' });
        return runSync(userId, 'full', emit);
      }
      messageIds = result.ids;
      await upsertSyncState({ userId, lastHistoryId: result.newHistoryId, lastSyncAt: Date.now(), status: 'syncing' });
    } else {
      // Build per-group queries: group all configured sender emails by parserId
      // (null = DeepSeek-only senders like Anthropic — still fetched here)
      const parserGroups = new Map<string, string[]>();
      for (const f of filters) {
        const key = f.parserId ?? 'deepseek_explicit';
        if (!parserGroups.has(key)) parserGroups.set(key, []);
        parserGroups.get(key)!.push(f.email);
      }

      const since = defaultSince();
      const seen  = new Set<string>();

      for (const [groupKey, emails] of parserGroups) {
        emit({ type: 'progress', phase: 'fetching', parser: groupKey });
        const query = `from:(${emails.join(' OR ')}) after:${gmailDateStr(since)}`;
        const ids   = await listMessageIds(userId, query, 500);
        let added   = 0;
        for (const id of ids) {
          if (!seen.has(id)) { seen.add(id); messageIds.push(id); added++; }
        }
        emit({ type: 'progress', phase: 'fetching', parser: groupKey, count: added });
      }

      const historyId = await getHistoryId(userId);
      await upsertSyncState({ userId, lastHistoryId: historyId, lastFullSync: Date.now(), lastSyncAt: Date.now(), status: 'syncing' });
    }

    // ── Skip already-processed messages ─────────────────────────────────────
    // Full sync already cleared everything above, so all IDs are fresh.
    // Incremental skips any already-attempted ID to avoid duplicate work.
    const skipFn = mode === 'full' ? isAlreadyParsed : isAlreadyAttempted;
    const fresh  = messageIds.filter((id) => !skipFn(id));

    console.log(`[sync:${mode}] fetched=${messageIds.length} already-skipped=${messageIds.length - fresh.length} to-process=${fresh.length}`);

    emit({ type: 'progress', phase: 'parsing', done: 0, total: fresh.length });

    let inserted = 0;
    let skipped  = 0;
    let done     = 0;

    // ── Process in batches of 10, AI calls parallelised within each batch ───
    const AI_CONCURRENCY = 10;
    for (let i = 0; i < fresh.length; i += AI_CONCURRENCY) {
      // Check for stop request before each batch
      if (abortRequested.has(userId)) {
        abortRequested.delete(userId);
        console.log(`[sync:${mode}] aborted by user after processing ${done}/${fresh.length} emails`);
        await upsertSyncState({ userId, status: 'idle' });
        emit({ type: 'done', inserted, updated: 0, skipped });
        return;
      }
      const batch    = fresh.slice(i, i + AI_CONCURRENCY);
      const messages = await getMessagesBatch(userId, batch, 5);

      await Promise.all(messages.map(async (msg) => {
        if (!msg.id) return;
        try {
          const decoded = await decodeMessage(msg);
          const ctx: ParserContext = {
            subject:     decoded.subject,
            from:        decoded.from,
            date:        decoded.date,
            snippet:     decoded.snippet,
            textContent: decoded.textContent,
            messageId:   decoded.messageId,
            threadId:    decoded.threadId,
          };

          // Resolve parserId: exact email address → domain → null
          const fromEmailMatch = decoded.from.match(/[\w.+%-]+@[\w.-]+\.[A-Za-z]{2,}/);
          const fromEmail      = fromEmailMatch ? fromEmailMatch[0].toLowerCase() : '';
          const mappedParserId = emailToParser.get(fromEmail);
          const parserId       = mappedParserId !== undefined
            ? mappedParserId
            : (getParserForDomain(decoded.senderDomain)?.id ?? null);

          const brandHint = parserId ? PARSER_BRAND[parserId] : undefined;

          // For known-brand emails: brand parser first (fast, tuned, no API cost).
          // AI runs only if brand parser returns null, or for unknown senders.
          let txns: ParsedTxn[] | null = null;
          if (parserId) {
            const parser = getParserById(parserId);
            if (parser) txns = await parser.parse(ctx);
          }

          // Brand parser returned nothing (or no brand parser) → try AI
          if (!txns?.length) {
            const aiResult = await extractWithAI(ctx, brandHint);
            if (aiResult) txns = [aiResult];
          }

          if (txns?.length) {
            upsertTransactions(txns.map((t) => toRow(t, userId)));
            inserted += txns.length;
            recordSyncAttempt(userId, msg.id, txns[0].source, 'parsed');
          } else {
            recordSyncAttempt(userId, msg.id, parserId ?? 'unknown', 'unparsed');
            skipped++;
          }
        } catch (err) {
          recordSyncAttempt(userId, msg.id ?? '', null, 'error', String(err));
        }
        done++;
      }));

      emit({ type: 'progress', phase: 'parsing', done, total: fresh.length });
    }

    console.log(`[sync:${mode}] done — inserted=${inserted} skipped=${skipped} total-processed=${done}`);

    await upsertSyncState({ userId, lastSyncAt: Date.now(), status: 'idle' });
    emit({ type: 'done', inserted, updated: 0, skipped });
  } catch (err) {
    await upsertSyncState({ userId, status: 'idle' });
    emit({ type: 'error', message: String(err) });
  }
}

