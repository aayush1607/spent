import type { Parser, ParserContext, ParsedTxn } from './types.js';
import { parseINR, parseAllINR, parseEmailDate, gmailDateStr, defaultSince } from './util.js';

export const amazonParser: Parser = {
  id: 'amazon',
  senderDomains: ['amazon.in', 'amazon.com'],
  subjectHints: [/order/i, /invoice/i, /shipped/i, /delivered/i],

  gmailQuery(since) {
    const d = since ?? defaultSince();
    return `from:(shipment-tracking@amazon.in OR auto-confirm@amazon.in OR invoice@amazon.in) after:${gmailDateStr(d)}`;
  },

  async parse(ctx: ParserContext): Promise<ParsedTxn[] | null> {
    // Skip dispatch/shipping notifications without amounts
    if (/(?:shipped|out for delivery|dispatched)/i.test(ctx.subject) &&
        !/(invoice|payment|order total)/i.test(ctx.subject)) {
      return null;
    }

    const text = ctx.textContent;

    // Require an explicit order/payment total — don't fall back to max amount
    const totalMatch = text.match(/(?:order\s+total|grand\s+total|amount\s+charged|amount\s+paid|you\s+paid)[^\d₹Rs]*?((?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?)/i);
    const amount = totalMatch ? parseINR(totalMatch[1]) : null;

    if (!amount || amount <= 0) return null;

    // Extract order ID
    const orderIdMatch = text.match(/order\s+(?:id|#|number)[:\s]+([A-Z0-9\-]+)/i);
    const orderId = orderIdMatch ? orderIdMatch[1] : undefined;

    return [{
      date:     parseEmailDate(ctx.date),
      merchant: 'Amazon',
      amount,
      currency: 'INR',
      category: 'shopping',
      source:   'amazon',
      emailId:  ctx.messageId,
      threadId: ctx.threadId,
      subject:  ctx.subject,
      fromAddr: ctx.from,
      snippet:  ctx.snippet,
      details:  { orderId },
    }];
  },
};
