import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import {
  totalSpend, sumByCategory, sumBySource, sumByWeek,
  topMerchants, queryTransactions,
} from '$server/db/repo/transactions.js';
import { getSyncState } from '$server/db/repo/syncState.js';

// Simple in-memory cache — key: `${userId}:${month}`
const cache = new Map<string, { data: unknown; at: number }>();
const CACHE_TTL = 60_000;

function monthRange(month: string): { from: string; to: string } {
  const [year, mon] = month.split('-').map(Number);
  const from = `${year}-${String(mon).padStart(2, '0')}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const to = `${year}-${String(mon).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

export const GET: RequestHandler = ({ cookies, url }) => {
  const userId = cookies.get('spent_uid');
  if (!userId) return json({ error: 'Unauthorized' }, { status: 401 });

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month = url.searchParams.get('month') ?? defaultMonth;

  const cacheKey = `${userId}:${month}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    return json(cached.data);
  }

  const { from, to } = monthRange(month);
  const agg = { userId, from, to };

  const total       = totalSpend(agg);
  const byCategory  = sumByCategory(agg);
  const bySource    = sumBySource(agg);
  const byWeek      = sumByWeek(agg);
  const merchants   = topMerchants(agg, 10);
  const topTxns     = queryTransactions({ userId, from, to, limit: 5, sort: 'amount', dir: 'desc' }).items;

  // Delta vs last month
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  const prevRange = monthRange(prevMonth);
  const prevTotal = totalSpend({ userId, from: prevRange.from, to: prevRange.to });
  const vsLastMonth = prevTotal > 0 ? (total - prevTotal) / prevTotal : null;

  const syncState = getSyncState(userId);

  const data = {
    month,
    total,
    byCategory,
    bySource,
    byWeek,
    topMerchants: merchants,
    topTxns,
    deltas: { vsLastMonth },
    lastSyncAt: syncState?.lastSyncAt ?? null,
  };

  cache.set(cacheKey, { data, at: Date.now() });
  return json(data);
};
