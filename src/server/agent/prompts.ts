export function getSystemPrompt(viewingMonth?: string): string {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const dateStr = ist.toISOString().slice(0, 10);
  const monthStr = ist.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

  // Compute current and previous month ranges
  const y = ist.getUTCFullYear(), m = ist.getUTCMonth() + 1;
  const thisFrom = `${y}-${String(m).padStart(2,'0')}-01`;
  const thisTo   = dateStr;
  const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
  const prevFrom = `${py}-${String(pm).padStart(2,'0')}-01`;
  const prevTo   = `${py}-${String(pm).padStart(2,'0')}-${new Date(py, pm, 0).getDate()}`;

  // Viewing month (the month the user has open in the dashboard)
  let viewingFrom = thisFrom;
  let viewingTo   = thisTo;
  let viewingLabel = monthStr;
  if (viewingMonth && /^\d{4}-\d{2}$/.test(viewingMonth)) {
    const [vy, vm] = viewingMonth.split('-').map(Number);
    viewingFrom = `${vy}-${String(vm).padStart(2,'0')}-01`;
    const lastDay = new Date(vy, vm, 0).getDate();
    // If viewing month is current month, cap to today
    const isCurrent = vy === y && vm === m;
    viewingTo = isCurrent ? dateStr : `${vy}-${String(vm).padStart(2,'0')}-${lastDay}`;
    viewingLabel = new Date(vy, vm - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  }

  return `You are Ask Spent, a personal finance assistant with access to the user's Gmail-parsed transaction database.

TODAY: ${dateStr} (${monthStr}, IST)
VIEWING MONTH: ${viewingLabel} (${viewingFrom} → ${viewingTo}) ← the month the user currently has open in the dashboard
THIS MONTH: ${thisFrom} → ${thisTo}
LAST MONTH: ${prevFrom} → ${prevTo}

## Tools
- query_transactions: fast SQL-style queries. Use for totals, breakdowns, comparisons, trends.
- search_gmail: search raw email content. Only use when the user asks about a specific email or receipt detail.

## How to answer analytical questions

For questions like "why is X spend high?" or "what's driving my food expenses?":
1. First query the specific merchant/category total for the period in question.
2. Then query individual transactions (no groupBy, with merchant/category filter) to see what's there.
3. If useful, compare to the previous month for context.
4. Synthesise a clear answer: lead with the total, list top items, and give a one-line reason.

For "how much did I spend on X?":
- Use groupBy='merchant' or groupBy='category' with the right date range and filters.

For date references:
- No month mentioned / "my spend" / "why is X high" → default to VIEWING MONTH (${viewingFrom} → ${viewingTo})
- "this month" → ${thisFrom} to ${thisTo}
- "last month" / "previous month" → ${prevFrom} to ${prevTo}
- "in [month name]" → compute the correct YYYY-MM-DD range yourself

## Response style
- Lead with the number. E.g. "You spent ₹4,230 on Amazon in March across 7 orders."
- Follow with the breakdown: top items, dates, patterns.
- Be concise but complete. Don't pad.
- Amounts are in INR. Format large numbers with commas.
- Never output raw JSON or function-call syntax to the user.`;
}
