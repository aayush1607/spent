import type { Parser, ParserContext, ParsedTxn } from './types.js';
import { parseINR, parseAllINR, parseEmailDate, gmailDateStr, defaultSince } from './util.js';

export const indigoParser: Parser = {
  id: 'indigo',
  senderDomains: ['goindigo.in'],
  subjectHints: [/booking/i, /confirmed/i, /itinerary/i],

  gmailQuery(since) {
    const d = since ?? defaultSince();
    return `from:(noreply@goindigo.in OR customercare@goindigo.in) after:${gmailDateStr(d)}`;
  },

  async parse(ctx: ParserContext): Promise<ParsedTxn[] | null> {
    const text = ctx.textContent;

    // Require an explicit fare/payment match — don't fall back to max amount
    const totalMatch = text.match(/(?:total\s+fare|amount\s+paid|amount\s+charged|you\s+paid)[^\d₹Rs]*?((?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?)/i);
    const amount = totalMatch ? parseINR(totalMatch[1]) : null;
    if (!amount || amount <= 0) return null;

    const pnrMatch = text.match(/PNR[:\s]+([A-Z0-9]+)/i);
    const flightMatch = text.match(/6E[-\s]?(\d+)/i);
    const routeMatch = ctx.subject.match(/([A-Z]{3})\s*[-–→]\s*([A-Z]{3})/);

    return [{
      date:     parseEmailDate(ctx.date),
      merchant: 'IndiGo',
      amount,
      currency: 'INR',
      category: 'travel',
      source:   'indigo',
      emailId:  ctx.messageId,
      threadId: ctx.threadId,
      subject:  ctx.subject,
      fromAddr: ctx.from,
      snippet:  ctx.snippet,
      details:  {
        pnr:    pnrMatch?.[1],
        flight: flightMatch ? `6E-${flightMatch[1]}` : undefined,
        route:  routeMatch ? `${routeMatch[1]} → ${routeMatch[2]}` : undefined,
      },
    }];
  },
};
