import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { queryTransactions } from '$server/db/repo/transactions.js';

export const GET: RequestHandler = ({ cookies, url }) => {
  const userId = cookies.get('spent_uid');
  if (!userId) return json({ error: 'Unauthorized' }, { status: 401 });

  const p = url.searchParams;
  const category = p.getAll('category');
  const source   = p.getAll('source');

  const { items, total } = queryTransactions({
    userId,
    from:      p.get('from') ?? undefined,
    to:        p.get('to') ?? undefined,
    category:  category.length ? category : undefined,
    source:    source.length ? source : undefined,
    merchant:  p.get('merchant') ?? undefined,
    minAmount: p.get('minAmount') ? Number(p.get('minAmount')) : undefined,
    maxAmount: p.get('maxAmount') ? Number(p.get('maxAmount')) : undefined,
    q:         p.get('q') ?? undefined,
    limit:     p.get('limit') ? Number(p.get('limit')) : 100,
    offset:    p.get('offset') ? Number(p.get('offset')) : 0,
    sort:      (p.get('sort') as 'date' | 'amount') ?? 'date',
    dir:       (p.get('dir') as 'asc' | 'desc') ?? 'desc',
  });

  const limit  = p.get('limit') ? Number(p.get('limit')) : 100;
  const offset = p.get('offset') ? Number(p.get('offset')) : 0;
  const nextOffset = offset + items.length < total ? offset + items.length : null;

  return json({ items, total, nextOffset });
};
