// Date, time and money formatting for the Portal. Everything is shown in Eastern time (the cycle's timezone).
const NY = 'America/New_York';

/** Placeholder text for a setting that is not filled in yet, as the signed-off Figma frames show them. */
export const PLACEHOLDER = { amount: '[amount]', time: '[time]', date: '[date]', month: '[month]' } as const;

// 200000 -> "$2,000" (cents are dropped when they are zero).
export function formatMoney(cents: number | null | undefined): string {
  if (!cents) return PLACEHOLDER.amount;
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(cents / 100);
}

// A timestamp's calendar date in Eastern time, as "2026-09-14".
export function easternDate(ts: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: NY }).format(new Date(ts));
}

// "2026-09-14" -> "Mon Sep 14".
export function longDay(isoDate: string | null | undefined): string {
  if (!isoDate) return PLACEHOLDER.date;
  const [y, m, d] = isoDate.split('-').map(Number);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
  return parts.replace(',', '');
}

// "2026-09-14" -> "Sep 14".
export function shortDay(isoDate: string | null | undefined): string {
  if (!isoDate) return PLACEHOLDER.date;
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d)));
}

// A timestamp's Eastern clock time: "11:59 PM".
export function easternTime(ts: string | null | undefined): string {
  if (!ts) return PLACEHOLDER.time;
  return new Intl.DateTimeFormat('en-US', { timeZone: NY, hour: 'numeric', minute: '2-digit' }).format(new Date(ts));
}

// Whole days between two "YYYY-MM-DD" dates (b minus a).
export function daysBetween(a: string, b: string): number {
  const ms = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(b) - ms(a)) / 86400000);
}

// "2026-10-09T16:12:00Z" -> "4:12 PM" (Eastern), for the "Saved 4:12 PM" line.
export function savedTime(ts: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: NY, hour: 'numeric', minute: '2-digit' }).format(new Date(ts));
}
