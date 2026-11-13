// The Mentorship page in LIVE mode: reads the real tables as the signed-in person (row-level security applies) through a
// reader (lib/mentorship-db.ts on the server; a stand-in in tests/mentorship-live.test.ts) and builds the page's shape with
// the pure mapping in lib/mentorship-map.ts.
// Core reads (the program, its checklist, the steps and who owns them) fail the checklist: the page draws its designed
// load error. Optional reads (the people list and the Programs chat) fail only the chat panel. A missing program or
// checklist is not a failure: the page shows "No steps yet."
import { mapMessages, mapSteps, statusWord, type Row } from './mentorship-map';
import type { MentorshipView, MsCaps, MsChat } from './mentorship-view';
import { easternDay } from './refresh-time';

/** One read's filters. `order` lists the sort columns; the last one must be unique for a paged read. */
export type MsReadOpts = { eq?: Record<string, unknown>; in?: Record<string, unknown[]>; order?: [string, boolean][]; limit?: number };

/** How live mode reads: `rows` is one request (small reads, or a capped `limit`); `all` pages through every row. */
export type MsReader = {
  rows: (table: string, select: string, o?: MsReadOpts) => Promise<Row[]>;
  all: (table: string, select: string, o: MsReadOpts) => Promise<Row[]>;
};

/** The signed-in person as the loader needs them (from requireStaff). */
export type MsUser = { id: string; initials: string; role: string };

/** How many chat messages the panel shows (the newest). */
export const MS_CHAT_LIMIT = 40;
/** Task ids per `in (...)` read. */
export const MS_ID_CHUNK = 100;

// Splits ids into chunks of MS_ID_CHUNK (a long id list would overflow the request URL).
function chunked<T>(ids: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += MS_ID_CHUNK) out.push(ids.slice(i, i + MS_ID_CHUNK));
  return out;
}

/** The program's steps: its first checklist (by position) and that checklist's tasks with their owners. */
async function readSteps(r: MsReader): Promise<{ status: unknown; listId: string | null; tasks: Row[]; assignees: Row[] }> {
  const prog = (await r.rows('programs', 'id, status', { eq: { slug: 'mentorship' }, order: [['id', true]], limit: 1 }))[0];
  if (!prog) return { status: null, listId: null, tasks: [], assignees: [] };
  const list = (await r.rows('checklists', 'id', { eq: { program_id: prog.id }, order: [['position', true], ['id', true]], limit: 1 }))[0];
  if (!list) return { status: prog.status, listId: null, tasks: [], assignees: [] };
  // Only this checklist's tasks (never "every task"), paged by id; the page orders them by position.
  const tasks = await r.all('tasks', 'id, title, note, due_on, status, type, position, assignee_group', { eq: { checklist_id: list.id, archived: false }, order: [['id', true]] });
  // Owners only for the loaded tasks, 100 ids at a time.
  const ids = tasks.map((t) => t.id);
  const parts = await Promise.all(chunked(ids).map((c) => r.all('task_assignees', 'task_id, user_id', { in: { task_id: c }, order: [['task_id', true], ['user_id', true]] })));
  return { status: prog.status, listId: String(list.id), tasks, assignees: parts.flat() };
}

/** The Programs chat: the area channel and its newest MS_CHAT_LIMIT messages, names from staff_profiles. */
async function readChat(r: MsReader, me: MsUser, today: string): Promise<MsChat> {
  const title = 'Programs chat';
  try {
    const [staffRows, channels] = await Promise.all([
      r.all('staff_profiles', 'user_id, display_name, initials', { order: [['user_id', true]] }),
      r.rows('chat_channels', 'id', { eq: { kind: 'area', area: 'programs' }, order: [['id', true]], limit: 1 }),
    ]);
    const staff = new Map(staffRows.map((p) => [String(p.user_id), { name: String(p.display_name ?? ''), initials: String(p.initials ?? '') }]));
    const channel = channels[0];
    if (!channel) return { failed: false, title, people: staff.size, messages: [], channelId: null };
    // The newest messages (created_at, then id, both descending: a stable order); drawn oldest first.
    const rows = await r.rows('chat_messages', 'id, author_id, is_bot, body, created_at', {
      eq: { channel_id: channel.id },
      order: [
        ['created_at', false],
        ['id', false],
      ],
      limit: MS_CHAT_LIMIT,
    });
    return { failed: false, title, people: staff.size, messages: mapMessages(rows, staff, { userId: me.id, initials: me.initials }, today), channelId: String(channel.id) };
  } catch {
    return { failed: true, title };
  }
}

/** Loads the live page. `now` is the server's clock (today's Eastern day is counted from it). */
export async function loadLiveMentorship(r: MsReader, me: MsUser, now: Date = new Date()): Promise<MentorshipView> {
  const today = easternDay(now.toISOString());
  const staffRole = me.role === 'admin' || me.role === 'board';
  const [stepsRead, chat] = await Promise.all([readSteps(r).then((v) => ({ ok: true as const, ...v }), () => ({ ok: false as const })), readChat(r, me, today)]);
  const steps = stepsRead.ok ? mapSteps(stepsRead.tasks, stepsRead.assignees) : [];
  const caps: MsCaps = {
    // tasks.status update: admins and board members may update tasks (row-level security); the writer refuses approvals.
    tick: stepsRead.ok && staffRole,
    // Undo is the reverse status write (same table, same rule).
    undo: stepsRead.ok && staffRole,
    // No mentor application table or function exists: never live.
    share: false,
    // chat_messages insert into the Programs channel: admins and board members, only when the channel exists.
    send: !chat.failed && chat.channelId != null && staffRole,
  };
  return {
    failed: false,
    today,
    me: { userId: me.id, initials: me.initials },
    status: statusWord(stepsRead.ok ? stepsRead.status : null),
    checklistId: stepsRead.ok ? stepsRead.listId : null,
    loadFailed: !stepsRead.ok,
    steps,
    chat,
    caps,
  };
}
