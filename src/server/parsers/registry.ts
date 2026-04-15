import type { Parser } from './types.js';
import { swiggyParser } from './swiggy.js';
import { zomatoParser } from './zomato.js';
import { amazonParser } from './amazon.js';
import { rapidoParser } from './rapido.js';
import { uberParser } from './uber.js';
import { cleartripParser } from './cleartrip.js';
import { indigoParser } from './indigo.js';
import { genericDeepSeekParser } from './generic_deepseek.js';

// Ordered brand parsers — checked by sender domain first
export const BRAND_PARSERS: Parser[] = [
  swiggyParser,
  zomatoParser,
  amazonParser,
  rapidoParser,
  uberParser,
  cleartripParser,
  indigoParser,
];

// Fallback parser for unknown senders
export const FALLBACK_PARSER = genericDeepSeekParser;

// Map: domain → parser (for O(1) dispatch)
const domainMap = new Map<string, Parser>();
for (const parser of BRAND_PARSERS) {
  for (const domain of parser.senderDomains) {
    domainMap.set(domain, parser);
  }
}

export function getParserForDomain(domain: string): Parser | null {
  return domainMap.get(domain) ?? null;
}

export function getParserById(id: string): Parser | null {
  return BRAND_PARSERS.find((p) => p.id === id) ?? null;
}

// Known domains to exclude from fallback sweep
export const KNOWN_DOMAINS = new Set(BRAND_PARSERS.flatMap((p) => p.senderDomains));
