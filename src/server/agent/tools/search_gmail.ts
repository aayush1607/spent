import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { listMessageIds, getMessagesBatch } from '../../gmail/fetch.js';
import { decodeMessage } from '../../gmail/decode.js';

export const SearchGmailInput = z.object({
  query:      z.string().describe('Gmail search query (uses Gmail search syntax)'),
  dateRange:  z.object({ from: z.string(), to: z.string() }).optional(),
  maxResults: z.number().min(1).max(25).optional().default(10),
});

export type SearchGmailInput = z.infer<typeof SearchGmailInput>;

export const searchGmailTool = {
  type: 'function' as const,
  function: {
    name: 'search_gmail',
    description: 'Search Gmail for emails. Returns subject, sender, date, and snippet. Use for specific email lookups or when transaction DB lacks enough detail.',
    parameters: zodToJsonSchema(SearchGmailInput, { $refStrategy: 'none' }),
  },
};

export async function runSearchGmail(userId: string, input: SearchGmailInput): Promise<unknown> {
  let query = input.query;
  if (input.dateRange) {
    query += ` after:${input.dateRange.from.replace(/-/g, '/')} before:${input.dateRange.to.replace(/-/g, '/')}`;
  }

  const ids = await listMessageIds(userId, query, input.maxResults ?? 10);
  if (!ids.length) return { results: [], count: 0 };

  const messages = await getMessagesBatch(userId, ids, 3);
  const results = await Promise.all(messages.map(async (msg) => {
    const d = await decodeMessage(msg);
    return {
      id:      d.messageId,
      from:    d.from,
      subject: d.subject,
      date:    d.date,
      snippet: d.snippet,
    };
  }));

  return { results, count: results.length };
}
