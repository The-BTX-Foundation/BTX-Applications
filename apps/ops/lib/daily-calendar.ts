// Pure logic for the Calendar page: rows from the different tables -> CalItem. No server imports, so it is unit-tested
// (tests/daily-calendar.test.ts).
import { daysBetween } from './tasks-shared';
import type { Raw } from './daily-tasks';
import type { CalArea, CalItem } from '@/components/calendar/types';

const str = (v: unknown) => String(v ?? '');
const AREAS: CalArea[] = ['scholarships', 'programs', 'money', 'outreach'];
const area = (v: unknown, fallback: CalArea = 'scholarships'): CalArea => (AREAS.includes(v as CalArea) ? (v as CalArea) : fallback);

/** An Eastern-time calendar date ("2026-10-05") from a timestamp. */
export const nyDay = (ts: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(ts));
/** An Eastern-time clock time ("10:00 AM") from a timestamp. */
export const nyTime = (ts: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(new Date(ts));
// "10:00 AM" -> "10:00" (the chip drops AM / PM, as the design does).
const bare = (t: string) => t.replace(/ (AM|PM)$/, '');
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const dayName = (d: string) => {
  const [y, m, dd] = d.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(Date.UTC(y, m - 1, dd))).replace(',', '');
};

/** Events entered in the app (calendar_events). */
export function eventItems(rows: Raw[]): CalItem[] {
  return rows.map((e) => {
    const allDay = e.all_day === true;
    const start = allDay ? null : nyTime(str(e.starts_at));
    const title = str(e.title);
    return {
      id: `ev:${str(e.id)}`,
      date: nyDay(str(e.starts_at)),
      source: 'event',
      area: area(e.area),
      chip: start ? `${bare(start)} ${title}` : title,
      title,
      start,
      people: e.owner_id ? [str(e.owner_id)] : [],
      video: Boolean(e.video_url),
    };
  });
}

/** Booked interviews: an active booking on a slot, the pair, the application number. */
export function interviewItems(bookings: Raw[], slots: Raw[], pairings: Raw[], apps: Raw[]): CalItem[] {
  const slot = new Map(slots.map((s) => [str(s.id), s]));
  const pair = new Map(pairings.map((p) => [str(p.slot_id), p]));
  const code = new Map(apps.map((a) => [str(a.id), str(a.applicant_code)]));
  const out: CalItem[] = [];
  for (const b of bookings) {
    if (b.status !== 'active') continue;
    const s = slot.get(str(b.slot_id));
    if (!s) continue;
    const p = pair.get(str(b.slot_id));
    const start = nyTime(str(s.starts_at));
    out.push({
      id: `iv:${str(b.id)}`,
      date: nyDay(str(s.starts_at)),
      source: 'interview',
      area: 'scholarships',
      chip: `${bare(start)} Interview`,
      title: `Interview ${code.get(str(b.application_id)) ?? ''}`.trim(),
      start,
      people: p ? [str(p.interviewer_a), str(p.interviewer_b)] : [],
      video: Boolean(p?.video_url),
    });
  }
  return out;
}

/** Open tasks with a due date. A late one is a bar from its due date to today. */
export function taskItems(tasks: Raw[], assignees: Raw[], today: string): CalItem[] {
  const owners = new Map<string, string[]>();
  for (const a of assignees) owners.set(str(a.task_id), [...(owners.get(str(a.task_id)) ?? []), str(a.user_id)]);
  const out: CalItem[] = [];
  for (const t of tasks) {
    if (t.archived || !t.due_on || (t.status !== 'open' && t.status !== 'in_progress')) continue;
    const due = str(t.due_on);
    const late = daysBetween(due, today);
    const base = { id: `tk:${str(t.id)}`, date: due, source: 'task' as const, area: area(t.area), title: str(t.title), start: null, people: owners.get(str(t.id)) ?? [] };
    if (late > 0) out.push({ ...base, endDate: today, chip: `${str(t.title)}, ${plural(late, 'day')} late`, span: true, late: true });
    else out.push({ ...base, chip: str(t.title) });
  }
  return out;
}

/** Social posts with a date. */
export function postItems(posts: Raw[]): CalItem[] {
  return posts
    .filter((p) => p.post_on)
    .map((p) => ({
      id: `po:${str(p.id)}`,
      date: str(p.post_on),
      source: 'post' as const,
      area: 'outreach' as const,
      chip: str(p.title),
      title: str(p.title),
      start: null,
      people: p.owner_id ? [str(p.owner_id)] : [],
    }));
}

/** The cycle's dates: applications open and close, the interview window (a bar), the decision date. Archived cycles skipped. */
export function cycleItems(cycles: Raw[]): CalItem[] {
  const out: CalItem[] = [];
  for (const c of cycles) {
    if (c.status === 'archived') continue;
    const id = str(c.id);
    const mk = (suffix: string, date: string, title: string, extra: Partial<CalItem> = {}): CalItem => ({ id: `cy:${id}:${suffix}`, date, source: 'cycle', area: 'scholarships', chip: title, title, start: null, people: [], ...extra });
    if (c.opens_at) out.push(mk('open', nyDay(str(c.opens_at)), 'Applications open'));
    if (c.closes_at) out.push(mk('close', nyDay(str(c.closes_at)), 'Applications close'));
    if (c.interview_start && c.interview_end) {
      const t = `Interviews, to ${dayName(str(c.interview_end))}`;
      out.push(mk('win', str(c.interview_start), t, { endDate: str(c.interview_end), span: true }));
    }
    if (c.decision_date) out.push(mk('decide', str(c.decision_date), 'Decisions'));
  }
  return out;
}

/** Plan milestones that are not done. */
export function milestoneItems(rows: Raw[]): CalItem[] {
  return rows
    .filter((m) => m.due_on && !m.done && !m.archived)
    .map((m) => ({ id: `ms:${str(m.id)}`, date: str(m.due_on), source: 'task' as const, area: area(m.area, 'programs'), chip: str(m.name), title: str(m.name), start: null, people: [] }));
}

/** Everything that falls on one day, spans included, in the panel's order: timed items by time, then the rest. */
export function dayAgenda(items: CalItem[], day: string, minutes: (t: string | null) => number): CalItem[] {
  const on = items.filter((i) => (i.span ? i.date <= day && day <= (i.endDate ?? i.date) : i.date === day));
  return on
    .map((it, n) => ({ it, n }))
    .sort((a, b) => Number(Boolean(b.it.listFirst)) - Number(Boolean(a.it.listFirst)) || Number(Boolean(b.it.start)) - Number(Boolean(a.it.start)) || minutes(a.it.start) - minutes(b.it.start) || a.n - b.n)
    .map((x) => x.it);
}
