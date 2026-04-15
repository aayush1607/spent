import type { Parser, ParserContext, ParsedTxn } from './types.js';
import { parseINR, parseEmailDate, gmailDateStr, defaultSince } from './util.js';

export const rapidoParser: Parser = {
  id: 'rapido',
  senderDomains: ['rapido.bike'],

  gmailQuery(since) {
    const d = since ?? defaultSince();
    return `from:(noreply@rapido.bike OR support@rapido.bike) after:${gmailDateStr(d)}`;
  },

  async parse(ctx: ParserContext): Promise<ParsedTxn[] | null> {
    const text = ctx.textContent;
    const amount = parseINR(text.match(/(?:fare|total|amount)[^\d₹Rs]*?((?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?)/i)?.[1] ?? text);
    if (!amount || amount <= 0) return null;

    const routeMatch = text.match(/(?:from|pickup)[:\s]+(.+?)\s+(?:to|drop)[:\s]+(.+?)(?:\s|$)/i);
    const route = routeMatch ? `${routeMatch[1].trim()} → ${routeMatch[2].trim()}` : undefined;

    return [{
      date:     parseEmailDate(ctx.date),
      merchant: 'Rapido',
      amount,
      currency: 'INR',
      category: 'transport',
      source:   'rapido',
      emailId:  ctx.messageId,
      threadId: ctx.threadId,
      subject:  ctx.subject,
      fromAddr: ctx.from,
      snippet:  ctx.snippet,
      details:  { route },
    }];
  },
};
