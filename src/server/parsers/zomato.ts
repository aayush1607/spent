import type { Parser, ParserContext, ParsedTxn } from './types.js';
import { parseINR, parseEmailDate, gmailDateStr, defaultSince } from './util.js';

export const zomatoParser: Parser = {
  id: 'zomato',
  senderDomains: ['zomato.com'],
  subjectHints: [/order/i, /delivered/i],

  gmailQuery(since) {
    const d = since ?? defaultSince();
    return `from:(no-reply@zomato.com OR orders@zomato.com) after:${gmailDateStr(d)}`;
  },

  async parse(ctx: ParserContext): Promise<ParsedTxn[] | null> {
    const text = ctx.textContent;

    const amount = parseINR(
      text.match(/(?:total|bill\s+amount|amount\s+paid)[^\d₹Rs]*?((?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?)/i)?.[1] ?? text
    );
    if (!amount || amount <= 0) return null;

    const restaurantMatch = ctx.subject.match(/(?:from|at)\s+(.+?)(?:\s+is|\s+has|\s*$)/i);
    const restaurant = restaurantMatch ? restaurantMatch[1].trim() : 'Zomato';

    return [{
      date:     parseEmailDate(ctx.date),
      merchant: 'Zomato',
      amount,
      currency: 'INR',
      category: 'food',
      source:   'zomato',
      emailId:  ctx.messageId,
      threadId: ctx.threadId,
      subject:  ctx.subject,
      fromAddr: ctx.from,
      snippet:  ctx.snippet,
      details:  { restaurant },
    }];
  },
};
