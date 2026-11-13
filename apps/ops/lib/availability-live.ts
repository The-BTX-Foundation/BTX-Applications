// Interviews > Your availability in LIVE mode: reads the newest published cycle and the signed-in board member's own
// free time, limit, note, sent time and "students I know", as that person (row-level security applies), through a reader
// (lib/availability-db.ts on the server; a stand-in in tests). The same tables and filters the current page reads
// (lib/interview-flow-db.ts readMyAvailability), with every list paged in a stable order. A failed read is the page's
// load error (never an empty page) and logs one server line with the table and error code only.
import { mergeRanges, windowDays, type MinuteRange } from './free-ranges';
import { easternDay } from './refresh-time';
import type { AvailabilityView } from './availability-view';

/** One row as the database returns it. */
export type Row = Record<string, unknown>;
/** One read's filters. `order` lists the sort columns; for a paged read the columns together are unique. */
export type AvReadOpts = { eq?: Record<string, unknown>; order?: [string, boolean][]; limit?: number };
/** How live mode reads: `rows` is one request (with a limit); `all` pages through every matching row. */
export type AvReader = {
  rows: (table: string, select: string, o?: AvReadOpts) => Promise<Row[]>;
  all: (table: string, select: string, o: AvReadOpts) => Promise<Row[]>;
};

/** A read that failed: which table, and the database's error code (never its message, which may hold names). */
export class AvReadFailed extends Error {
  constructor(
    readonly table: string,
    readonly code: string,
  ) {
    super(`read failed: ${table}`);
  }
}

// The database's error code, when it looks like one ("42501", "PGRST301"); else "unknown".
function codeOf(e: unknown): string {
  const c = e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : '';
  return /^[\w.-]{1,40}$/.test(c) ? c : 'unknown';
}

// Runs one read and tags a failure with its table and code.
async function tagged<T>(table: string, read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (e) {
    throw new AvReadFailed(table, codeOf(e));
  }
}

// A date column as "YYYY-MM-DD" (kept as a string, never turned into an instant).
const dateOnly = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

/** The signed-in person as the loader needs them (from requireStaff). */
export type AvUser = { id: string; initials: string };

// The page with nothing in it (no cycle, no dates, or a failed read).
function blank(today: string, me: AvUser, term = ''): AvailabilityView {
  return {
    today,
    term,
    days: [],
    me: { initials: me.initials },
    ranges: [],
    maxInterviews: null,
    text: '',
    sentAt: null,
    dueOn: null,
    conflicts: [],
    bookings: [],
    noDates: true,
    loadFailed: false,
    caps: { send: true, reader: true, bookings: false, mock: false },
    failFirst: { send: false },
  };
}

/** Loads the live page. `now` is the server's clock (today's Eastern day is counted from it). */
export async function loadLiveAvailability(r: AvReader, me: AvUser, now: Date = new Date()): Promise<AvailabilityView> {
  const today = easternDay(now.toISOString());
  try {
    // The newest published cycle (the same pick as lib/availability.ts publishedCycle; id breaks a created_at tie).
    const cycle = (
      await tagged('cycles', () =>
        r.rows('cycles', 'id, term, closes_at, interview_start, interview_end', {
          eq: { status: 'published' },
          order: [
            ['created_at', false],
            ['id', false],
          ],
          limit: 1,
        }),
      )
    )[0];
    if (!cycle) return blank(today, me);
    const term = String(cycle.term ?? '');
    const start = dateOnly(cycle.interview_start);
    const end = dateOnly(cycle.interview_end);
    const days = windowDays(start, end);
    const dueOn = typeof cycle.closes_at === 'string' ? easternDay(cycle.closes_at) : null;
    if (!days.length) return { ...blank(today, me, term), dueOn };
    const mine = { cycle_id: cycle.id, user_id: me.id };
    const [ranges, prefs, names] = await Promise.all([
      // The primary key is (cycle, user, day, start_min), so day + start_min is unique here.
      tagged('board_free_ranges', () => r.all('board_free_ranges', 'day, start_min, end_min', { eq: mine, order: [['day', true], ['start_min', true]] })),
      tagged('board_interview_prefs', () => r.rows('board_interview_prefs', 'max_interviews, availability_text, availability_sent_at', { eq: mine, limit: 1 })),
      // Row-level security returns only the caller's own names, whatever the filter says.
      tagged('board_conflicts', () => r.all('board_conflicts', 'id, name, created_at', { eq: mine, order: [['created_at', true], ['id', true]] })),
    ]);
    const list: MinuteRange[] = ranges.flatMap((x) => {
      const day = dateOnly(x.day);
      const s = Number(x.start_min);
      const e = Number(x.end_min);
      return day && Number.isFinite(s) && Number.isFinite(e) ? [{ day, startMin: s, endMin: e }] : [];
    });
    const p = prefs[0];
    const max = p?.max_interviews;
    return {
      ...blank(today, me, term),
      days,
      dueOn,
      noDates: false,
      ranges: mergeRanges(list, { start, end }),
      maxInterviews: typeof max === 'number' && Number.isFinite(max) ? max : null,
      text: typeof p?.availability_text === 'string' ? p.availability_text : '',
      sentAt: typeof p?.availability_sent_at === 'string' ? p.availability_sent_at : null,
      conflicts: names.map((n) => String(n.name ?? '')).filter(Boolean),
    };
  } catch (e) {
    const f = e instanceof AvReadFailed ? e : new AvReadFailed('unknown', 'unknown');
    console.error('[availability] read failed', { table: f.table, code: f.code });
    return { ...blank(today, me), noDates: false, loadFailed: true };
  }
}
