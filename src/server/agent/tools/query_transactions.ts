import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { queryTransactions, sumByCategory, sumBySource, sumByWeek, topMerchants, totalSpend } from '../../db/repo/transactions.js';

export const QueryTransactionsInput = z.object({
  from:      z.string().optional().describe('Start date YYYY-MM-DD'),
  to:        z.string().optional().describe('End date YYYY-MM-DD'),
  category:  z.array(z.enum(['food','shopping','travel','transport','bills','entertainment','other'])).optional(),
  source:    z.array(z.string()).optional().describe('Parser source: swiggy, zomato, amazon, rapido, uber, cleartrip, indigo, deepseek_generic'),
  merchant:  z.string().optional().describe('Merchant name (partial match)'),
  minAmount: z.number().optional(),
  maxAmount: z.number().optional(),
  groupBy:   z.enum(['day','week','month','category','merchant','source']).optional(),
  agg:       z.enum(['sum','count','avg']).optional().default('sum'),
  limit:     z.number().optional().default(20),
});

export type QueryTransactionsInput = z.infer<typeof QueryTransactionsInput>;

export const queryTransactionsTool = {
  type: 'function' as const,
  function: {
    name: 'query_transactions',
    description: 'Query the local transaction database. Use groupBy for aggregates (totals by category, by week, etc). Use without groupBy for individual transactions.',
    parameters: zodToJsonSchema(QueryTransactionsInput, { $refStrategy: 'none' }),
  },
};

export function runQueryTransactions(userId: string, input: QueryTransactionsInput): unknown {
  const agg = {
    userId,
    from: input.from ?? '2020-01-01',
    to:   input.to   ?? new Date().toISOString().slice(0, 10),
  };

  if (input.groupBy === 'category') {
    return { rows: sumByCategory(agg) };
  }
  if (input.groupBy === 'source') {
    return { rows: sumBySource(agg) };
  }
  if (input.groupBy === 'week') {
    return { rows: sumByWeek(agg) };
  }
  if (input.groupBy === 'merchant') {
    return { rows: topMerchants(agg, input.limit ?? 20) };
  }
  if (input.groupBy === 'month' || input.groupBy === 'day') {
    // Simple total for the range
    const total = totalSpend(agg);
    return { total, from: agg.from, to: agg.to };
  }

  // Raw transaction list
  const { items, total } = queryTransactions({
    userId,
    from:      input.from,
    to:        input.to,
    category:  input.category,
    source:    input.source,
    merchant:  input.merchant,
    minAmount: input.minAmount,
    maxAmount: input.maxAmount,
    limit:     input.limit ?? 20,
  });

  return { items: items.slice(0, 50), total };
}
