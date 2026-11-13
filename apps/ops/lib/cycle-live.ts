// The Cycle page in LIVE mode: reads the real tables as the signed-in person (row-level security applies) through a
// reader (lib/cycle-db.ts on the server; a stand-in in tests/cycle-live.test.ts) and builds the page's shape with the
// pure logic in lib/cycle-map.ts.
//
// What a failed read does, so a failure never reads as a true number:
// - the cycle row (core): the page draws its designed "The cycle didn't load." line;
// - the counts (applied, booked, scored): that count reads "Couldn't count", never 0;
// - the checklist (checklists, their tasks, the tasks' owners): only the checklist panel shows its error line;
// - the people list: the chat panel and the checklist show their error lines (owners would lose their names);
// - the Scholarships chat: only the chat panel shows its error line.
// Every caught failure logs one server line with the table and the database's error code only (no names, no rows).
// Nothing here writes; open and closed come from the cycle's dates (B14), never from `status`.
import { chunk, mapRows, nowStage, stagesFor, type Row } from './cycle-map';
import type { CyCaps, CyChat, CyCycle, CycleView } from './cycle-view';
import { mapMessages } from './mentorship-map';
import { easternDay } from './refresh-time';

/** One read's filters and its order (the last column must make the order unique for a paged read). */
export type CyReadOpts = { eq?: Record<string, unknown>; in?: Record<string, unknown[]>; order: [string, boolean][] };

/** How live mode reads: `rows` is one request with a limit; `all` pages through every row. */
export type CyReader = {
  rows: (table: string, select: string, o: CyReadOpts & { limit: number }) => Promise<Row[]>;
  all: (table: string, select: string, o: CyReadOpts) => Promise<Row[]>;
};

/** The signed-in person as the loader needs them (from requireStaff). */
export type CyUser = { id: string; name: string; initials: string; role: string };

/** How many chat messages the panel shows (the newest). */
export const CY_CHAT_LIMIT = 40;

/** Live mode draws no demo write: the chat composer is the only write, and only where the channel exists. */
export function liveCaps(user: CyUser, chat: CyChat): CyCaps {
  const staff = user.role === 'admin' || user.role === 'board';
  return {
    // Emails students: never built (owner rule).
    remind: false,
    // No table or function shares a schedule with the board.
    share: false,
    // Steps are done on /tasks (the page links there); no write is wired here.
    tick: false,
    // No direct-message writer on this page (rule 4): the waiting line shows without the button.
    nudge: false,
    // chat_messages insert into the Scholarships channel: admins and board members, when the channel exists.
    send: staff && !chat.failed && chat.channelId != null,
  };
}

// A failed read, tagged with its table, so the server log can say which read failed.
class ReadFailed extends Error {
  constructor(
    readonly table: string,
    readonly code: string,
  ) {
    super(`read failed: ${table}`);
  }
}

// The database's error code ("42501"), or "unknown"; never the message (it can quote row data).
function codeOf(e: unknown): string {
  const c = e && typeof e === 'object' ? (e as { code?: unknown }).code : undefined;
  return typeof c === 'string' && /^[\w.-]{1,40}$/.test(c) ? c : 'unknown';
}

// The reader with each failure tagged by its table.
function tagged(r: CyReader): CyReader {
  const tag = (table: string) => (e: unknown) => {
    throw e instanceof ReadFailed ? e : new ReadFailed(table, codeOf(e));
  };
  return {
    rows: (table, select, o) => r.rows(table, select, o).catch(tag(table)),
    all: (table, select, o) => r.all(table, select, o).catch(tag(table)),
  };
}

// One server log line per caught failure: the table and the code. No row data, no names.
function logFail(e: unknown): void {
  const f = e instanceof ReadFailed ? e : null;
  console.error('[cycle] read failed', { table: f?.table ?? 'unknown', code: f?.code ?? codeOf(e) });
}

// Runs a read; a failure logs once and returns null (the caller shows its own error, never a zero).
async function soft<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    logFail(e);
    return null;
  }
}

const CYCLE_COLS = 'id, term, award_name, award_amount_cents, opens_at, closes_at, interview_start, interview_end, decision_date, decisions_released_at';

// A "YYYY-MM-DD" date column as a calendar day (kept as text, never parsed).
const day = (v: unknown): string | null => (typeof v === 'string' && v ? v.slice(0, 10) : null);

/** The published cycle row in the page's shape (counts filled in later). The three dates with no column stay null. */
export function cycleFromRow(c: Row): CyCycle {
  const cents = Number(c.award_amount_cents);
  return {
    title: `${String(c.term ?? '').trim() || 'Scholarship'} cycle`,
    award: typeof c.award_name === 'string' && c.award_name.trim() ? c.award_name.trim() : null,
    amountCents: Number.isFinite(cents) && cents > 0 ? cents : null,
    opensAt: typeof c.opens_at === 'string' ? c.opens_at : null,
    closesAt: typeof c.closes_at === 'string' ? c.closes_at : null,
    interviewStart: day(c.interview_start),
    interviewEnd: day(c.interview_end),
    scoresDue: null,
    selectionDay: null,
    selectionTime: null,
    decisionDate: day(c.decision_date),
    fundsSent: null,
    released: c.decisions_released_at != null,
    applied: null,
    booked: null,
    scored: null,
  };
}

/** The three counts: submitted applications, those with an active booking, those with both scores published. */
async function readCounts(r: CyReader, cycleId: unknown): Promise<Pick<CyCycle, 'applied' | 'booked' | 'scored'>> {
  const apps = await soft(r.all('applications', 'id', { eq: { cycle_id: cycleId, status: 'submitted' }, order: [['id', true]] }));
  if (!apps) return { applied: null, booked: null, scored: null };
  const ids = apps.map((a) => a.id);
  const parts = chunk(ids);
  const [bookings, summary] = await Promise.all([
    soft(Promise.all(parts.map((c) => r.all('bookings', 'id, application_id', { eq: { status: 'active' }, in: { application_id: c }, order: [['id', true]] }))).then((x) => x.flat())),
    soft(Promise.all(parts.map((c) => r.all('application_score_summary', 'application_id, published_count', { in: { application_id: c }, order: [['application_id', true]] }))).then((x) => x.flat())),
  ]);
  return {
    applied: ids.length,
    booked: bookings ? new Set(bookings.map((b) => String(b.application_id))).size : null,
    scored: summary ? summary.filter((x) => Number(x.published_count) >= 2).length : null,
  };
}

/** The cycle's checklists, only their tasks (not archived), and only those tasks' owners (100 ids at a time). */
async function readChecklist(r: CyReader, cycleId: unknown): Promise<{ lists: Row[]; tasks: Row[]; assignees: Row[] }> {
  const lists = await r.all('checklists', 'id, title, position', { eq: { cycle_id: cycleId }, order: [['position', true], ['id', true]] });
  if (!lists.length) return { lists, tasks: [], assignees: [] };
  const taskParts = await Promise.all(
    chunk(lists.map((l) => l.id)).map((c) => r.all('tasks', 'id, title, type, due_on, status, assignee_group, checklist_id, position, completed_at', { eq: { archived: false }, in: { checklist_id: c }, order: [['id', true]] })),
  );
  const tasks = taskParts.flat();
  const parts = await Promise.all(chunk(tasks.map((t) => t.id)).map((c) => r.all('task_assignees', 'task_id, user_id', { in: { task_id: c }, order: [['task_id', true], ['user_id', true]] })));
  return { lists, tasks, assignees: parts.flat() };
}

/** The Scholarships chat: the area channel and its newest CY_CHAT_LIMIT messages, names from `staff`. */
async function readChat(r: CyReader, staff: Map<string, { name: string; initials: string }> | null, me: CyUser, today: string): Promise<CyChat> {
  const title = 'Scholarships chat';
  if (!staff) return { failed: true, title };
  try {
    const channel = (await r.rows('chat_channels', 'id', { eq: { kind: 'area', area: 'scholarships' }, order: [['id', true]], limit: 1 }))[0];
    if (!channel) return { failed: false, title, people: staff.size, messages: [], channelId: null };
    const rows = await r.rows('chat_messages', 'id, author_id, is_bot, body, created_at', {
      eq: { channel_id: channel.id },
      order: [
        ['created_at', false],
        ['id', false],
      ],
      limit: CY_CHAT_LIMIT,
    });
    return { failed: false, title, people: staff.size, messages: mapMessages(rows, staff, { userId: me.id, initials: me.initials }, today), channelId: String(channel.id), capped: rows.length >= CY_CHAT_LIMIT };
  } catch (e) {
    logFail(e);
    return { failed: true, title };
  }
}

/** Loads the live page. `now` is the server's clock (today's Eastern day and open / closed are counted from it). */
export async function loadLiveCycle(reader: CyReader, me: CyUser, now: Date = new Date()): Promise<CycleView> {
  const r = tagged(reader);
  const instant = now.toISOString();
  const today = easternDay(instant);
  const staffRows = await soft(r.all('staff_profiles', 'user_id, display_name, initials', { order: [['user_id', true]] }));
  const staff = staffRows ? new Map(staffRows.map((p) => [String(p.user_id), { name: String(p.display_name ?? ''), initials: String(p.initials ?? '') }])) : null;
  const chatP = readChat(r, staff, me, today);
  const base = { today, now: instant, me: { userId: me.id, initials: me.initials } };

  let row: Row | undefined;
  try {
    row = (await r.all('cycles', CYCLE_COLS, { eq: { status: 'published' }, order: [['id', true]] }))[0];
  } catch (e) {
    logFail(e);
    const chat = await chatP;
    return { ...base, cycle: null, loadFailed: true, rows: [], listFailed: false, chat, caps: liveCaps(me, chat) };
  }
  if (!row) {
    const chat = await chatP;
    return { ...base, cycle: null, loadFailed: false, rows: [], listFailed: false, chat, caps: liveCaps(me, chat) };
  }

  const cycle = cycleFromRow(row);
  const [counts, list, chat] = await Promise.all([readCounts(r, row.id), soft(readChecklist(r, row.id)), chatP]);
  Object.assign(cycle, counts);
  const nowGroup = nowStage(stagesFor(cycle, today, instant))?.group ?? null;
  // Without the people list every owner would read "Board member": the checklist shows its load error instead.
  const listOk = list != null && staff != null;
  const rows = listOk ? mapRows(list.lists, list.tasks, list.assignees, staff, { userId: me.id, name: me.name, initials: me.initials }, cycle, nowGroup) : [];
  return { ...base, cycle, loadFailed: false, rows, listFailed: !listOk, chat, caps: liveCaps(me, chat) };
}
