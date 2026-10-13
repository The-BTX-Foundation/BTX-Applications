// Small date helpers. All dates are plain YYYY-MM-DD strings in Eastern time; we never build a local Date from them,
// so the server's own time zone cannot shift a day.
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** True for a real calendar day written YYYY-MM-DD (so "2026-02-31" is rejected). */
export function isDay(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = DAY_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekdayIndex(day: string): number {
  const m = DAY_RE.exec(day)!;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
}

export function weekdayName(day: string): string {
  return WEEKDAYS[weekdayIndex(day)];
}

/** Every day from first to last, inclusive. */
export function daysBetween(first: string, last: string): string[] {
  const out: string[] = [];
  const m = DAY_RE.exec(first)!;
  const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  for (let i = 0; i < 400; i++) {
    const s = t.toISOString().slice(0, 10);
    if (s > last) break;
    out.push(s);
    t.setUTCDate(t.getUTCDate() + 1);
  }
  return out;
}

/** "HH:MM" to minutes after midnight, or null when it is not a real time. */
export function toMinutes(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = +m[1];
  const min = +m[2];
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function fromMinutes(n: number): string {
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}
