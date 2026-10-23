// The words of a push. Every push is TWO rows: a title and one short line (Dominick, 2026-10-22). Applicants appear as
// "Applicant 15", never by name, email or full code, because pushes show on lock screens.
export const TITLE_MAX = 40;
export const BODY_MAX = 60;
export const TIME_ZONE = 'America/New_York';

/** One line: whitespace and newlines collapsed, cut with an ellipsis at `max` characters. */
export function clip(text: string, max: number): string {
  const one = String(text ?? '').replace(/\s+/g, ' ').trim();
  return one.length <= max ? one : `${one.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** "APP-2026-00015" is "Applicant 15". Anything without trailing digits is just "Applicant". */
export function applicantNumber(code: string | null | undefined): string {
  const m = /(\d+)\s*$/.exec(String(code ?? ''));
  return m ? `Applicant ${Number(m[1])}` : 'Applicant';
}

const parts = (iso: string | Date, opts: Intl.DateTimeFormatOptions) => {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, ...opts }).formatToParts(new Date(iso))) out[p.type] = p.value;
  return out;
};

/** "Tue Nov 10, 6:00 PM" in Eastern time. */
export function whenLabel(iso: string | Date): string {
  const p = parts(iso, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  return `${p.weekday} ${p.month} ${p.day}, ${p.hour}:${p.minute} ${String(p.dayPeriod ?? '').toUpperCase()}`.trim();
}

/** "Fri Nov 6" in Eastern time. */
export function dayLabel(iso: string | Date): string {
  const p = parts(iso, { weekday: 'short', month: 'short', day: 'numeric' });
  return `${p.weekday} ${p.month} ${p.day}`;
}

/** "Nov 20" in Eastern time, from a calendar day such as "2026-11-20" (no zone shift). */
export function shortDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** The calendar day in Eastern time, "2026-11-10". */
export function easternDay(d: Date): string {
  const p = parts(d, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${p.year}-${p.month}-${p.day}`;
}

/** The next Eastern calendar day after `d` (daylight-saving safe). */
export function tomorrowEastern(d: Date): string {
  const [y, m, day] = easternDay(d).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day + 1)).toISOString().slice(0, 10);
}

export type Words = { title: string; body?: string };

/** The two-row rule, enforced in one place: a title up to 40 characters and one line of up to 60. */
export function twoRows(w: Words): Words {
  const title = clip(w.title, TITLE_MAX) || 'BTX Ops Hub';
  const body = w.body ? clip(w.body, BODY_MAX) : '';
  return body ? { title, body } : { title };
}
