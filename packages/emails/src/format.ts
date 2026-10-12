// Small date and money formatters for email copy. Dates are calendar dates ("2026-10-09"), shown without a time zone shift.
export const PLACEHOLDER = { amount: '[amount]', date: '[date]' } as const;

// 200000 -> "$2,000" (cents are dropped when they are zero); null -> "[amount]".
export function formatMoney(cents: number | null | undefined): string {
  if (!cents) return PLACEHOLDER.amount;
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(cents / 100);
}

// "2026-10-09" -> "Fri Oct 9"; empty -> "[date]".
export function emailDay(isoDate: string | null | undefined): string {
  if (!isoDate) return PLACEHOLDER.date;
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d))).replace(',', '');
}
