// Parse Indian Rupee amounts from common formats:
// ₹840, Rs.840, INR 840, 1,234.00, 1234.5
export function parseINR(text: string): number | null {
  const pattern = /(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/i;
  const match = text.match(pattern);
  if (!match) return null;
  return parseFloat(match[1].replace(/,/g, ''));
}

export function parseAllINR(text: string): number[] {
  const pattern = /(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/gi;
  const amounts: number[] = [];
  for (const m of text.matchAll(pattern)) {
    const n = parseFloat(m[1].replace(/,/g, ''));
    if (!isNaN(n) && n > 0) amounts.push(n);
  }
  return amounts;
}

// Parse dates from email header date strings to ISO yyyy-mm-dd
export function parseEmailDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  // Convert to IST (UTC+5:30)
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

// Format a Date to YYYY/MM/DD for Gmail query since param
export function gmailDateStr(d: Date): string {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export function defaultSince(days = 180): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}
