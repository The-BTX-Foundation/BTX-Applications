// Live mode: builds the Certifications view (lib/cert-view.ts) from the real tables as the signed-in person. The reads go
// through a reader (lib/cert-db.ts: the session client, so row-level security applies), passed in so tests can stand in
// for the database (tests/cert-live.test.ts). The mapping is pure (lib/cert-map.ts).
//
// What a failed read does, so a failure never reads as "no steps" or "no ideas":
// - core reads (staff, the program, its checklists, their tasks and assignees, the ideas): the page shows the header and
//   the "Certification program didn't load." card;
// - the Programs chat (optional): only the chat panel shows its own load error; the rest of the page still shows.
// Every read of a table that can grow is paged (lib/cert-db.ts) and every `in (...)` list is sent 100 ids at a time.
import { chatDay } from './area-map';
import { chunks } from './calendar-paging';
import { liveCaps, liveIdeas, livePlan, liveStaff, liveSteps, CERT_STATUS } from './cert-map';
import { timeLabel } from './format';
import { easternDay } from './refresh-time';
import type { CertChat, CertMsg, CertResult, CertView } from './cert-view';

type Row = Record<string, unknown>;

/** Filters and order for one read. `order` lists the columns that make the order unique (paging needs it). */
export type CertReadOpts = { eq?: Record<string, unknown>; in?: Record<string, unknown[]>; order: [string, boolean][]; limit?: number };

/** How live mode reads: `rows` is one request (with a limit), `all` pages until every row is in. */
export type CertReader = {
  rows: (table: string, select: string, o: CertReadOpts) => Promise<Row[]>;
  all: (table: string, select: string, o: CertReadOpts) => Promise<Row[]>;
};

/** Who is looking (requireStaff): the id names "You", the role decides whether the chat composer is drawn. */
export type CertWho = { id: string; role: string };

/** How many chat messages the panel shows (the newest). */
export const CHAT_LAST = 40;

/** An empty chat (the panel draws its own error when `failed`). */
const emptyChat = (failed: boolean, people = 0): CertChat => ({ title: 'Programs chat', people, messages: [], channelId: null, failed, capped: false });

/** The view live mode shows when a core read fails: the header and the "didn't load" card, nothing else. */
export function failedView(today: string, me: string): CertView {
  return {
    today,
    me,
    programId: null,
    checklistId: null,
    status: '',
    plan: { budget: '', note: null, seats: 0, seatsLabel: '', line: '' },
    steps: [],
    ideas: [],
    people: [],
    chat: emptyChat(false),
    loadFailed: true,
    caps: liveCaps({ programId: null, chat: false }),
  };
}

// Every row of `table` whose `col` is one of `ids`, read 100 ids at a time (any part failing fails the read).
async function byIds(read: CertReader, table: string, select: string, col: string, ids: string[], o: Omit<CertReadOpts, 'in'>): Promise<Row[]> {
  if (ids.length === 0) return [];
  const parts = await Promise.all(chunks(ids).map((c) => read.all(table, select, { ...o, in: { [col]: c } })));
  return parts.flat();
}

/** The Programs chat: the programs area channel and its newest messages, oldest first. Throws when a read fails. */
export async function readChat(read: CertReader, who: CertWho, staff: Map<string, { name: string; initials: string }>, now: Date): Promise<CertChat> {
  const channels = await read.rows('chat_channels', 'id', { eq: { kind: 'area', area: 'programs' }, order: [['id', true]], limit: 1 });
  if (channels.length === 0) return emptyChat(false, staff.size);
  const channelId = String(channels[0].id);
  const rows = await read.rows('chat_messages', 'id, author_id, is_bot, body, created_at', {
    eq: { channel_id: channelId },
    order: [
      ['created_at', false],
      ['id', false],
    ],
    limit: CHAT_LAST,
  });
  const messages: CertMsg[] = [...rows].reverse().map((r) => {
    const bot = r.is_bot === true;
    const author = r.author_id ? staff.get(String(r.author_id)) : undefined;
    const mine = !bot && String(r.author_id) === who.id;
    return {
      id: String(r.id),
      day: chatDay(String(r.created_at), now),
      who: bot ? 'BTX' : mine ? 'You' : (author?.name ?? 'A board member'),
      initials: author?.initials ?? '',
      bot,
      mine,
      time: timeLabel(String(r.created_at)),
      text: String(r.body ?? ''),
    };
  });
  return { title: 'Programs chat', people: staff.size, messages, channelId, failed: false, capped: rows.length >= CHAT_LAST };
}

/** Reads the real tables and returns the Certifications view (loadFailed when a core read fails). `now` is for tests. */
export async function loadLiveCertView(read: CertReader, who: CertWho, now = new Date()): Promise<CertResult> {
  const today = easternDay(now.toISOString());
  try {
    const [staffRows, programs] = await Promise.all([
      read.all('staff_profiles', 'user_id, display_name, initials', { order: [['user_id', true]] }),
      read.rows('programs', 'id, status, summary, pilot_budget_cents, budget_period, students_target, cost_per_student_cents', { eq: { slug: 'certification' }, order: [['id', true]], limit: 1 }),
    ]);
    const prog = programs[0];
    // No certification program row: nothing to show or add to; the page says it didn't load (as the old page did).
    if (!prog) return { ...failedView(today, who.id), noProgram: true, failed: false };
    const programId = String(prog.id);
    const staff = liveStaff(staffRows);
    const staffById = new Map(staff.map((p) => [p.id, p]));
    const [checklists, ideaRows, chat] = await Promise.all([
      read.all('checklists', 'id, position', { eq: { program_id: programId }, order: [['id', true]] }),
      read.all('certification_ideas', 'id, name, decision, suggested_by, created_at', { eq: { program_id: programId }, order: [['id', true]] }),
      // Optional: a failed chat read marks only the chat panel.
      readChat(read, who, staffById, now).catch(() => emptyChat(true, staff.length)),
    ]);
    // The setup checklist is the first by position; tasks are read from all of the program's checklists (an empty one
    // left over from an interrupted first add is harmless).
    const lists = [...checklists].sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0) || String(a.id).localeCompare(String(b.id)));
    const listIds = lists.map((c) => String(c.id));
    const tasks = await byIds(read, 'tasks', 'id, title, note, due_on, status, type, assignee_group, position', 'checklist_id', listIds, { eq: { archived: false }, order: [['id', true]] });
    const assignees = await byIds(read, 'task_assignees', 'task_id, user_id', 'task_id', tasks.map((t) => String(t.id)), {
      order: [
        ['task_id', true],
        ['user_id', true],
      ],
    });
    const canPost = who.role === 'admin' || who.role === 'board';
    const status = String(prog.status ?? '');
    return {
      today,
      me: who.id,
      programId,
      checklistId: listIds[0] ?? null,
      status: CERT_STATUS[status] ?? status,
      plan: livePlan(prog),
      steps: liveSteps(tasks, assignees, staff, who.id),
      ideas: liveIdeas(ideaRows, staff, who.id),
      people: staff,
      chat,
      loadFailed: false,
      caps: liveCaps({ programId, chat: canPost && !!chat.channelId && !chat.failed }),
      failed: false,
    };
  } catch {
    return { ...failedView(today, who.id), failed: false };
  }
}
