import type { Parser, ParserContext, ParsedTxn } from './types.js';
import { parseINR, parseAllINR, parseEmailDate, gmailDateStr, defaultSince } from './util.js';

export const cleartripParser: Parser = {
  id: 'cleartrip',
  senderDomains: ['cleartrip.com'],
  subjectHints: [/booking/i, /confirmed/i, /flight/i],

  gmailQuery(since) {
    const d = since ?? defaultSince();
    return `from:(noreply@cleartrip.com OR support@cleartrip.com) after:${gmailDateStr(d)}`;
  },

  async parse(ctx: ParserContext): Promise<ParsedTxn[] | null> {
    const text = ctx.textContent;

    // Require an explicit fare/payment total — don't fall back to max amount
    const totalMatch = text.match(/(?:total\s+fare|amount\s+paid|total\s+amount|you\s+paid)[^\d₹Rs]*?((?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?)/i);
    const amount = totalMatch ? parseINR(totalMatch[1]) : null;
    if (!amount || amount <= 0) return null;

    const pnrMatch = text.match(/PNR[:\s]+([A-Z0-9]+)/i);
    const routeMatch = ctx.subject.match(/([A-Z]{3})\s*[-–→]\s*([A-Z]{3})/);

    return [{
      date:     parseEmailDate(ctx.date),
      merchant: 'Cleartrip',
      amount,
      currency: 'INR',
      category: 'travel',
      source:   'cleartrip',
      emailId:  ctx.messageId,
      threadId: ctx.threadId,
      subject:  ctx.subject,
      fromAddr: ctx.from,
      snippet:  ctx.snippet,
      details:  {
        pnr: pnrMatch?.[1],
        route: routeMatch ? `${routeMatch[1]} → ${routeMatch[2]}` : undefined,
      },
    }];
  },
};
