import type { Parser, ParserContext, ParsedTxn } from './types.js';
import { parseINR, parseEmailDate, gmailDateStr, defaultSince } from './util.js';

export const uberParser: Parser = {
  id: 'uber',
  senderDomains: ['uber.com'],
  subjectHints: [/receipt/i, /trip/i],

  gmailQuery(since) {
    const d = since ?? defaultSince();
    return `from:(receipts@uber.com OR noreply@uber.com) after:${gmailDateStr(d)}`;
  },

  async parse(ctx: ParserContext): Promise<ParsedTxn[] | null> {
    const text = ctx.textContent;
    const amount = parseINR(text.match(/(?:total|fare|amount)[^\d₹Rs]*?((?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?)/i)?.[1] ?? text);
    if (!amount || amount <= 0) return null;

    const routeMatch = text.match(/(.+?)\s*→\s*(.+?)(?:\n|$)/);
    const route = routeMatch ? `${routeMatch[1].trim()} → ${routeMatch[2].trim()}` : undefined;

    return [{
      date:     parseEmailDate(ctx.date),
      merchant: 'Uber',
      amount,
      currency: 'INR',
      category: 'transport',
      source:   'uber',
      emailId:  ctx.messageId,
      threadId: ctx.threadId,
      subject:  ctx.subject,
      fromAddr: ctx.from,
      snippet:  ctx.snippet,
      details:  { route },
    }];
  },
};
