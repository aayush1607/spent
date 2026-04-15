import type { Category } from '../db/repo/transactions.js';

export type { Category };

export interface ParsedTxn {
  date: string;          // ISO yyyy-mm-dd
  merchant: string;
  amount: number;        // INR, positive
  currency: 'INR';
  category: Category;
  source: string;        // parser id
  emailId: string;
  threadId: string;
  details?: Record<string, unknown>;
  subject: string;
  fromAddr: string;
  snippet: string;
}

export interface ParserContext {
  subject: string;
  from: string;
  date: string;
  snippet: string;
  textContent: string;
  messageId: string;
  threadId: string;
}

export interface Parser {
  id: string;
  senderDomains: string[];
  subjectHints?: RegExp[];
  gmailQuery(since?: Date): string;
  parse(ctx: ParserContext): Promise<ParsedTxn[] | null>;
}
