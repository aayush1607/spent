import type { PageServerLoad } from './$types.js';

function monthRange(month: string) {
  const [year, mon] = month.split('-').map(Number);
  const from = `${year}-${String(mon).padStart(2, '0')}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const to = `${year}-${String(mon).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

export const load: PageServerLoad = async ({ cookies, url }) => {
  const userId = cookies.get('spent_uid');
  if (!userId) return { connected: false };

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month = url.searchParams.get('month') ?? defaultMonth;
  const { from, to } = monthRange(month);
  const agg = { userId, from, to };

  try {
    const {
      totalSpend, sumByCategory, sumBySource, sumByWeek,
      topMerchants, queryTransactions,
    } = await import('$server/db/repo/transactions.js');
    const { getSyncState } = await import('$server/db/repo/syncState.js');

    const total       = totalSpend(agg);
    const byCategory  = sumByCategory(agg);
    const bySource    = sumBySource(agg);
    const byWeek      = sumByWeek(agg);
    const merchants   = topMerchants(agg, 8);
    const recentTxns  = queryTransactions({ userId, from, to, limit: 20, sort: 'date', dir: 'desc' }).items;

    const prevDate    = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth   = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    const prevRange   = monthRange(prevMonth);
    const prevTotal   = totalSpend({ userId, from: prevRange.from, to: prevRange.to });
    const vsLastMonth = prevTotal > 0 ? (total - prevTotal) / prevTotal : null;

    const syncState  = getSyncState(userId);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysPassed  = Math.max(now.getDate(), 1);
    const dailyAvg    = total / daysPassed;
    const daysLeft    = daysInMonth - now.getDate();
    const projected   = total + dailyAvg * Math.max(daysLeft, 0);

    return {
      connected: true,
      month,
      summary: { total, byCategory, bySource, byWeek, vsLastMonth, dailyAvg, projected },
      merchants,
      recentTxns,
      lastSyncAt: syncState?.lastSyncAt ?? null,
      syncStatus: (syncState?.status ?? 'idle') as string,
    };
  } catch {
    return { connected: true, month, summary: null, merchants: [], recentTxns: [], lastSyncAt: null, syncStatus: 'idle' };
  }
};
