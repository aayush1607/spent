import type { Parser, ParserContext, ParsedTxn } from './types.js';
import { parseINR, parseEmailDate, gmailDateStr, defaultSince } from './util.js';

export const swiggyParser: Parser = {
  id: 'swiggy',
  senderDomains: ['swiggy.in', 'swiggy.com'],
  subjectHints: [/order/i, /delivered/i, /placed/i],

  gmailQuery(since) {
    const d = since ?? defaultSince();
    return `from:(no-reply@swiggy.in OR order@swiggy.in) after:${gmailDateStr(d)}`;
  },

  async parse(ctx: ParserContext): Promise<ParsedTxn[] | null> {
    const text = ctx.textContent;

    // Try to find an explicit total keyword first; fall back to any ₹ amount in the email
    const totalMatch = text.match(/(?:grand\s+total|total\s+amount|order\s+total|bill\s+total|amount\s+paid|you\s+paid|total\s+bill|total)[^\d₹Rs]*?((?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?)/i);
    const amount = parseINR(totalMatch?.[1] ?? text);
    if (!amount || amount <= 0) return null;

    // Restaurant name: usually in subject "Your Swiggy order from <Restaurant>"
    const restaurantMatch = ctx.subject.match(/from\s+(.+?)(?:\s+is|\s+has|\s+–|$)/i);
    const restaurant = restaurantMatch ? restaurantMatch[1].trim() : 'Swiggy';

    return [{
      date:     parseEmailDate(ctx.date),
      merchant: 'Swiggy',
      amount,
      currency: 'INR',
      category: 'food',
      source:   'swiggy',
      emailId:  ctx.messageId,
      threadId: ctx.threadId,
      subject:  ctx.subject,
      fromAddr: ctx.from,
      snippet:  ctx.snippet,
      details:  { restaurant },
    }];
  },
};
