import OpenAI from 'openai';
import { env } from '../config.js';
import { getCached, setCache } from '../db/repo/extractionCache.js';
import type { Parser, ParserContext, ParsedTxn, Category } from './types.js';
import { parseEmailDate } from './util.js';

export const VALID_CATEGORIES: Category[] = ['food', 'shopping', 'travel', 'transport', 'bills', 'entertainment', 'other'];

/** Canonical brand names keyed by parser id — used to anchor AI merchant extraction */
export const PARSER_BRAND: Record<string, string> = {
  swiggy:    'Swiggy',
  zomato:    'Zomato',
  amazon:    'Amazon',
  rapido:    'Rapido',
  uber:      'Uber',
  cleartrip: 'Cleartrip',
  indigo:    'IndiGo',
};

function getClient(): OpenAI {
  return new OpenAI({
    apiKey: env.AZURE_AI_KEY,
    baseURL: `${env.AZURE_AI_ENDPOINT}/models`,
    defaultHeaders: { 'Authorization': `Bearer ${env.AZURE_AI_KEY}` },
  });
}

interface AIResponse {
  skip?: boolean;
  merchant?: string;
  amount?: number;
  date?: string;
  category?: string;
}

/**
 * Primary extraction path — tries AI for every configured-sender email.
 * brandHint: if we know the sender brand (e.g. "Zomato"), pass it so the model
 *            uses it as the canonical merchant name instead of the sub-merchant.
 *
 * Returns a ParsedTxn on success, null if the email is not a payment confirmation
 * or if extraction fails. Errors are NOT cached so the next sync can retry.
 */
export async function extractWithAI(
  ctx: ParserContext,
  brandHint?: string,
): Promise<ParsedTxn | null> {
  // Cache hit: return immediately without calling API
  const cached = getCached(ctx.messageId);
  if (cached !== null) return cached.length > 0 ? cached[0] : null;

  const brandLine = brandHint
    ? `\nIMPORTANT: This email is FROM ${brandHint}. You MUST set "merchant" to exactly "${brandHint}" — do NOT use a restaurant, product, or sub-merchant name.`
    : '';

  const prompt = `You are a personal finance assistant that extracts spending transactions from emails.

ONLY extract a transaction if this email is a confirmation that the RECIPIENT has ALREADY PAID money — e.g. order confirmation, ride receipt, payment confirmation, booking confirmation after checkout.

Return {"skip":true} for ANY of the following:
- Invoice or bill SENT to the recipient requesting payment (GST invoice, vendor bill, training fee, etc.)
- Investment, SIP, mutual fund, or stock purchase notification (InCred, Zerodha, Groww, Paytm Money, etc.)
- Bank account credit, income deposit, or salary notification
- Refund, cashback, or reversal
- Promotional offer, newsletter, or marketing email
- Reminder, quote, pending payment, or due date notice
- Any notification where the money has NOT yet left the recipient's account
${brandLine}

If it IS a valid completed-payment confirmation, return ONLY valid JSON:
{"skip":false,"merchant":"<brand>","amount":<INR number>,"date":"<YYYY-MM-DD>","category":"<food|shopping|travel|transport|bills|entertainment|other>"}

Rules:
- merchant: use the PLATFORM/BRAND name (e.g. "Zomato" not the restaurant; "Amazon" not the product name)
- amount: positive number in INR, no symbols
- category: pick closest match
- Return ONLY valid JSON, nothing else

Email:
Subject: ${ctx.subject}
From: ${ctx.from}
Date: ${ctx.date}
Content: ${ctx.textContent.slice(0, 2500)}`;

  try {
    const client = getClient();
    const response = await client.chat.completions.create({
      model: env.DEEPSEEK_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 300,
      temperature: 0,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      setCache(ctx.messageId, []);
      return null;
    }

    const parsed = JSON.parse(content) as Partial<AIResponse>;

    if (parsed.skip === true || !parsed.merchant || !parsed.amount || parsed.amount <= 0) {
      setCache(ctx.messageId, []);
      return null;
    }

    const category: Category = VALID_CATEGORIES.includes(parsed.category as Category)
      ? (parsed.category as Category)
      : 'other';

    const txn: ParsedTxn = {
      date:     parsed.date ?? parseEmailDate(ctx.date),
      merchant: parsed.merchant,
      amount:   parsed.amount,
      currency: 'INR',
      category,
      source:   'deepseek_generic',
      emailId:  ctx.messageId,
      threadId: ctx.threadId,
      subject:  ctx.subject,
      fromAddr: ctx.from,
      snippet:  ctx.snippet,
    };

    setCache(ctx.messageId, [txn]);
    return txn;
  } catch {
    // Don't cache API errors — allow retry on next sync
    return null;
  }
}

export const genericDeepSeekParser: Parser = {
  id: 'deepseek_generic',
  senderDomains: [], // fallback only — no specific domains

  gmailQuery() {
    // This parser is never queried directly. All emails come from configured
    // sender filters in the sender_filters table. This method exists only to
    // satisfy the Parser interface.
    throw new Error('genericDeepSeekParser.gmailQuery should never be called — use sender_filters instead');
  },

  async parse(ctx: ParserContext): Promise<ParsedTxn[] | null> {
    const txn = await extractWithAI(ctx);
    return txn ? [txn] : null;
  },
};
