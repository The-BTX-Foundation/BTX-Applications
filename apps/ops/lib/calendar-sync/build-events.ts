// Pure logic for the Google Calendar sync: rows from the Ops Hub tables + "now" -> the full list of events the board's
// Google Calendar should hold. No I/O and no server imports, so it is unit-tested (tests/calendar-sync-build.test.ts).
// The Apps Script (apps/ops/google/calendar-sync/Code.gs) matches events by `id` and rewrites one when its `hash` changes.
//
// Privacy: this list leaves BTX (it goes to Google and onto phone lock screens). An interview carries the application
// number only, never the applicant's name, email or any other applicant field. The loader does not even read them.
import { createHash } from 'node:crypto';
import { cycleItems, nyDay } from '../daily-calendar';
import { easternDay, type Raw } from '../daily-tasks';
import { easternToIso } from '../calendar-event';
import { OPS_HUB_FALLBACK, SYNC_DAYS_AHEAD, SYNC_DAYS_BACK } from './config';

/** One event as Google should show it. All-day: 'YYYY-MM-DD' days with `end` EXCLUSIVE (Google's rule). Timed: ISO UTC. */
export type SyncEvent = {
  id: string;
  title: string;
  description: string;
  location: string;
  allDay: boolean;
  start: string;
  end: string;
  hash: string;
};

/** The raw rows the feed is built from (lib/calendar-sync/load-rows.ts reads them). */
export type SyncRows = {
  events: Raw[];
  tasks: Raw[];
  assignees: Raw[];
  posts: Raw[];
  milestones: Raw[];
  cycles: Raw[];
  bookings: Raw[];
  slots: Raw[];
  pairings: Raw[];
  /** Submitted applications: id and applicant_code only. */
  apps: Raw[];
  people: Raw[];
};

/** The feed's date range in Eastern days: `start` inclusive, `end` exclusive. */
export type SyncWindow = { start: string; end: string };

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const HOUR_MS = 60 * 60 * 1000;

/** "2026-11-01" + 1 -> "2026-11-02" (calendar arithmetic on a plain day, no time zone involved). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// A timestamp column -> ISO UTC, or null when it is missing or not a date.
function iso(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

// A date column ("2026-11-02") -> itself, or null when it is missing or malformed.
function day(v: unknown): string | null {
  const s = str(v).slice(0, 10);
  return DAY.test(s) ? s : null;
}

/** The window the feed covers for a given moment: today (Eastern) minus 30 days up to today plus 400 days. */
export function syncWindow(now: Date): SyncWindow {
  const today = easternDay(now);
  return { start: addDays(today, -SYNC_DAYS_BACK), end: addDays(today, SYNC_DAYS_AHEAD) };
}

/** The short fingerprint the Apps Script compares: first 16 hex characters of sha256 over every other field. */
export function eventHash(e: Omit<SyncEvent, 'hash'>): string {
  const body = JSON.stringify([e.id, e.title, e.description, e.location, e.allDay, e.start, e.end]);
  return createHash('sha256').update(body).digest('hex').slice(0, 16);
}

/** Builds every event the Google Calendar should hold, sorted by start then id. Rows missing a required field are skipped. */
export function buildSyncEvents(rows: SyncRows, now: Date, opsUrl: string = OPS_HUB_FALLBACK): SyncEvent[] {
  const footer = `From the BTX Ops Hub: ${opsUrl.replace(/\/+$/, '')}/calendar. Change it there; edits made here are replaced.`;
  // Body lines first, then a blank line and the footer. With no body lines the footer stands alone.
  const describe = (lines: string[]) => [...lines, ...(lines.length ? [''] : []), footer].join('\n');
  const names = new Map(rows.people.map((p) => [str(p.user_id), str(p.display_name)]));
  const out: Omit<SyncEvent, 'hash'>[] = [];

  // An all-day event covering `first`..`last` (inclusive); Google wants the day after `last` as the end.
  const allDay = (id: string, title: string, first: string, last: string, lines: string[] = [], location = '') =>
    out.push({ id, title, description: describe(lines), location, allDay: true, start: first, end: addDays(last, 1) });

  // Events entered in the app (calendar_events).
  for (const e of rows.events) {
    const id = str(e.id);
    const title = str(e.title);
    const start = iso(e.starts_at);
    if (!id || !title || !start) continue;
    const owner = names.get(str(e.owner_id));
    const lines = owner ? [`Owner: ${owner}`] : [];
    const location = str(e.location) || str(e.video_url);
    if (e.all_day === true) {
      // All-day events are stored at noon Eastern; their Eastern day is the one shown in the app.
      const d = nyDay(start);
      allDay(`event:${id}`, title, d, d, lines, location);
    } else {
      // No end time: an hour long, so Google draws a block rather than a sliver.
      const end = iso(e.ends_at) ?? new Date(new Date(start).getTime() + HOUR_MS).toISOString();
      out.push({ id: `event:${id}`, title, description: describe(lines), location, allDay: false, start, end });
    }
  }

  // Booked interviews: an active booking on a slot for a submitted application. Application number only (see top).
  const slots = new Map(rows.slots.map((s) => [str(s.id), s]));
  const pairs = new Map(rows.pairings.map((p) => [str(p.slot_id), p]));
  const codes = new Map(rows.apps.map((a) => [str(a.id), str(a.applicant_code)]));
  for (const b of rows.bookings) {
    if (b.status !== 'active') continue;
    const id = str(b.id);
    const slot = slots.get(str(b.slot_id));
    const code = codes.get(str(b.application_id));
    const start = iso(slot?.starts_at);
    const end = iso(slot?.ends_at);
    if (!id || !code || !start || !end) continue;
    const pair = pairs.get(str(b.slot_id));
    const lines: string[] = [];
    const who = [names.get(str(pair?.interviewer_a)), names.get(str(pair?.interviewer_b))].filter((n): n is string => Boolean(n));
    if (who.length) lines.push(`Interviewers: ${who.join(', ')}`);
    const video = str(pair?.video_url);
    if (video) lines.push(`Video: ${video}`);
    out.push({ id: `interview:${id}`, title: `BTX interview · ${code}`, description: describe(lines), location: video, allDay: false, start, end });
  }

  // Open tasks with a due date, on that one day (the page's "days late" bar is not copied).
  const owners = new Map<string, string[]>();
  for (const a of rows.assignees) {
    const name = names.get(str(a.user_id));
    if (name) owners.set(str(a.task_id), [...(owners.get(str(a.task_id)) ?? []), name]);
  }
  for (const t of rows.tasks) {
    if (t.archived === true || (t.status !== 'open' && t.status !== 'in_progress')) continue;
    const id = str(t.id);
    const title = str(t.title);
    const due = day(t.due_on);
    if (!id || !title || !due) continue;
    const who = owners.get(id) ?? [];
    allDay(`task:${id}`, `Due: ${title}`, due, due, who.length ? [`Assigned to: ${who.join(', ')}`] : []);
  }

  // Social posts with a date.
  for (const p of rows.posts) {
    const id = str(p.id);
    const title = str(p.title);
    const d = day(p.post_on);
    if (id && title && d) allDay(`post:${id}`, `Post: ${title}`, d, d);
  }

  // Plan milestones that are not done or archived.
  for (const m of rows.milestones) {
    if (m.done === true || m.archived === true) continue;
    const id = str(m.id);
    const name = str(m.name);
    const d = day(m.due_on);
    if (id && name && d) allDay(`milestone:${id}`, `Milestone: ${name}`, d, d);
  }

  // The cycles' dates, worded exactly as on the Calendar page (cycleItems, which already skips archived cycles and turns
  // timestamps into Eastern days). Draft cycles are left out: their dates are not public yet.
  const suffix: Record<string, string> = { open: 'opens', close: 'closes', win: 'interviews', decide: 'decision' };
  // A malformed timestamp is blanked first: cycleItems would throw on it, and a bad row must be skipped, not fatal.
  const published = rows.cycles
    .filter((c) => c.status !== 'draft' && str(c.id))
    .map((c) => ({ ...c, opens_at: iso(c.opens_at), closes_at: iso(c.closes_at), interview_start: day(c.interview_start), interview_end: day(c.interview_end), decision_date: day(c.decision_date) }));
  for (const it of cycleItems(published)) {
    const [, cycleId, kind] = it.id.split(':');
    const first = day(it.date);
    const last = day(it.endDate ?? it.date);
    if (!suffix[kind] || !first || !last || last < first) continue;
    allDay(`cycle:${cycleId}:${suffix[kind]}`, it.title, first, last);
  }

  // Keep what overlaps the window. All-day days compare as strings; timed events against Eastern midnight at each edge.
  const win = syncWindow(now);
  const winStart = Date.parse(easternToIso(win.start, '00:00'));
  const winEnd = Date.parse(easternToIso(win.end, '00:00'));
  const inWindow = (e: Omit<SyncEvent, 'hash'>) =>
    e.allDay ? e.start < win.end && e.end > win.start : Date.parse(e.start) < winEnd && Date.parse(e.end) > winStart;

  return out
    .filter(inWindow)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((e) => ({ ...e, hash: eventHash(e) }));
}
