const INR = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatINR(amount: number): string {
  return '₹' + INR.format(Math.round(amount));
}

export function formatINRFull(amount: number): string {
  return '₹' + new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDelta(ratio: number | null): { text: string; sign: '▲' | '▼' | '──'; color: string } {
  if (ratio === null) return { text: '──', sign: '──', color: 'var(--fg-2)' };
  const pct = Math.abs(ratio * 100).toFixed(1);
  if (ratio > 0.005) return { text: `▲ ${pct}%`, sign: '▲', color: 'var(--red)' };
  if (ratio < -0.005) return { text: `▼ ${pct}%`, sign: '▼', color: 'var(--green)' };
  return { text: '── 0%', sign: '──', color: 'var(--fg-2)' };
}

export function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }).toUpperCase();
}

export function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }).toUpperCase();
}

export function currentMonth(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

export function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function last12Months(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}
