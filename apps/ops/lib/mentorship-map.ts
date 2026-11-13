// The Mentorship page's pure logic (unit tested in tests/mentorship-map.test.ts; no database, no React): the live rows
// mapped to the page's shape, the step that is "now", the news card and the sentence read after a tick, the word on each
// step's line, the progress, and the small queue that keeps one step's writes in order.
import { clock, dueTitle, easternDay, rel, shortDate, addDays } from './refresh-time';
import type { MsMessage, MsStep, OpenStatus, TaskStatus } from './mentorship-view';

export type Row = Record<string, unknown>;
const s = (v: unknown): string => (v == null ? '' : String(v));

/** The word beside the title for a program status. A missing program reads as planned (nothing is running yet). */
export const STATUS_WORD: Record<string, string> = { planned: 'Not active yet', setting_up: 'Setting up', active: 'Active', paused: 'Paused', ended: 'Ended' };

/** The word for a programs.status value (unknown or missing values read as planned). */
export function statusWord(status: unknown): string {
  return STATUS_WORD[s(status)] ?? STATUS_WORD.planned;
}

/** The open statuses a step can hold (tasks.status, minus done). */
const OPEN: readonly OpenStatus[] = ['open', 'in_progress', 'declined'];

/** A loaded row's open status: its own when it is one of OPEN (declined and in_progress kept exactly), else 'open'. */
export function openStatus(status: unknown): OpenStatus {
  return (OPEN as readonly unknown[]).includes(status) ? (status as OpenStatus) : 'open';
}

/**
 * The checklist's steps from `tasks` rows (id, title, note, due_on, status, type, position, assignee_group) and their
 * `task_assignees` rows (task_id, user_id). Ordered by position, then id (rows arrive in id order from the paged read).
 * A step is unassigned when it is open and has neither a person nor a group.
 */
export function mapSteps(tasks: Row[], assignees: Row[]): MsStep[] {
  const owned = new Set(assignees.map((a) => s(a.task_id)));
  return [...tasks]
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0) || s(a.id).localeCompare(s(b.id)))
    .map((t) => {
      const done = t.status === 'done';
      return {
        id: s(t.id),
        title: s(t.title),
        done,
        reopenAs: openStatus(t.status),
        unassigned: !done && !owned.has(s(t.id)) && !t.assignee_group,
        due: t.due_on ? s(t.due_on).slice(0, 10) : null,
        sub: t.note ? s(t.note) : null,
        share: false,
        approval: t.type === 'approval',
      };
    });
}

/** "Today", "Yesterday" or "Wed Nov 4" for a message's Eastern day, counted from today's Eastern day. */
export function dayWord(today: string, day: string): string {
  if (day === today) return 'Today';
  if (day === addDays(today, -1)) return 'Yesterday';
  return shortDate(day);
}

/** Two-letter initials from a name ("Toby Faraday" -> "TF"). */
export function initialsFrom(name: string): string {
  const p = name.split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

/**
 * The chat thread from `chat_messages` rows (id, author_id, is_bot, body, created_at), oldest first. Names and initials
 * come from staff_profiles (`staff`: user id -> name and initials); the viewer's own messages say "You".
 */
export function mapMessages(rows: Row[], staff: Map<string, { name: string; initials: string }>, me: { userId: string; initials: string }, today: string): MsMessage[] {
  return [...rows]
    .sort((a, b) => s(a.created_at).localeCompare(s(b.created_at)) || s(a.id).localeCompare(s(b.id)))
    .map((r) => {
      const bot = r.is_bot === true;
      const mine = !bot && s(r.author_id) === me.userId;
      const p = staff.get(s(r.author_id));
      const who = bot ? 'BTX' : mine ? 'You' : (p?.name ?? 'Board member');
      const at = s(r.created_at);
      return {
        id: s(r.id),
        day: dayWord(today, easternDay(at)),
        who,
        initials: mine ? me.initials : (p?.initials ?? initialsFrom(who)),
        bot,
        mine,
        time: clock(at),
        text: s(r.body),
      };
    });
}

/** The step that is "now": the first one not done (undefined when every step is done). */
export function nextStep(steps: MsStep[]): MsStep | undefined {
  return steps.find((x) => !x.done);
}

/** "2 of 5". */
export function progress(steps: MsStep[]): { done: number; total: number } {
  return { done: steps.filter((x) => x.done).length, total: steps.length };
}

/** The news card under the title, or null (no steps, or every step done). `shared`: the application went out (mock). */
export type MsNews = { id: string; kicker: string; title: string; icon: 'people' | 'share' | 'flag'; gold: boolean };

/** The news card: the next step, gold when it needs the viewer (no owner yet, or the application still to share). */
export function newsFor(steps: MsStep[], shared: boolean, canShare: boolean): MsNews | null {
  const nx = nextStep(steps);
  if (!nx) return null;
  const num = steps.indexOf(nx) + 1;
  if (nx.unassigned) return { id: nx.id, kicker: 'No owner yet', title: nx.title, icon: 'people', gold: true };
  if (canShare && nx.share && shared) return { id: nx.id, kicker: 'Application shared', title: nx.title, icon: 'share', gold: false };
  if (canShare && nx.share) return { id: nx.id, kicker: `Next · step ${num}`, title: nx.title, icon: 'share', gold: true };
  return { id: nx.id, kicker: `Next · step ${num}`, title: nx.title, icon: 'flag', gold: false };
}

/** The sentence read to screen readers after a step is done (the demo's old headline). */
export function headline(steps: MsStep[], shared: boolean, canShare: boolean): string {
  if (!steps.length) return 'The mentorship program has no steps yet.';
  const nx = nextStep(steps);
  if (!nx) return 'Every mentorship step is done.';
  if (canShare && nx.share && shared) return 'The mentor application is shared. Recruiting is open.';
  if (nx.unassigned) return `${nx.title} has no owner yet.`;
  return `Next for mentorship: ${nx.title[0].toLowerCase() + nx.title.slice(1)}.`;
}

/** The word after "Step N" on a step's line: Done, a due word ("Next Thu"), Now, or Not started. */
export function stepWord(step: MsStep, isNow: boolean, today: string): { text: string; muted: boolean; title?: string } {
  if (step.done) return { text: 'Done', muted: true };
  if (step.due) return { text: rel(today, step.due), muted: false, title: dueTitle(today, step.due) };
  return { text: isNow ? 'Now' : 'Not started', muted: true };
}

/** The steps with the page's local ticks laid over the server's (`over`: step id -> done). */
export function withTicks(steps: MsStep[], over: Readonly<Record<string, boolean>>): MsStep[] {
  return steps.map((x) => (x.id in over && over[x.id] !== x.done ? { ...x, done: over[x.id] } : x));
}

/** The signature of the server's steps: a change means fresh data to take in. */
export function stepsSig(steps: MsStep[]): string {
  return steps.map((x) => `${x.id}:${x.done ? 1 : 0}:${x.reopenAs}:${x.title}:${x.due ?? ''}:${x.unassigned ? 1 : 0}:${x.sub ?? ''}`).join('|');
}

/** The status a live write sends for a tick: 'done', or the step's own open status when it is reopened. */
export function statusFor(step: MsStep, done: boolean): TaskStatus {
  return done ? 'done' : step.reopenAs;
}

/** The status a step shows right now (with local ticks laid over): what Undo puts back after the next tick. */
export function shownStatus(step: MsStep): TaskStatus {
  return statusFor(step, step.done);
}

/** How a step write ended: saved; refused because the step had changed (Undo's guard missed); or failed. */
export type MsWriteResult = 'ok' | 'changed' | 'failed';

/**
 * The local ticks after one step write settles. Only the newest write on a step (`newest`) may act; when it did not
 * save, the step's local tick is dropped so the server's value shows (never an earlier local value, which may itself be
 * a write that never landed).
 */
export function settleTick(over: Readonly<Record<string, boolean>>, id: string, res: MsWriteResult, newest: boolean): Record<string, boolean> {
  if (res === 'ok' || !newest || !(id in over)) return over as Record<string, boolean>;
  const next = { ...over };
  delete next[id];
  return next;
}

/** The mock clock: the demo's 9:14 AM plus one minute per action (`n` actions so far). */
export function mockClock(n: number): string {
  const m = 9 * 60 + 14 + n;
  return `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, '0')} ${m < 720 ? 'AM' : 'PM'}`;
}

/** Rows per request (the database API's silent cap) and the most pages one read may take. */
export const MS_PAGE = 1000;
export const MS_MAX_PAGES = 20;

/**
 * Reads every row through `fetchPage(from, to)` (inclusive positions, as `.range()` takes them). Each page starts after
 * the rows read so far (the server may return fewer than asked); only an empty page ends the read; a read still going at
 * the ceiling throws (the page shows its load error, never partial data).
 */
export async function pageRows<T>(fetchPage: (from: number, to: number) => Promise<T[]>, size = MS_PAGE, max = MS_MAX_PAGES): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < max; p++) {
    const rows = await fetchPage(out.length, out.length + size - 1);
    if (rows.length === 0) return out;
    out.push(...rows);
  }
  throw new Error(`Read reached ${max} pages; refusing partial data.`);
}

/**
 * Runs `write` after every earlier write queued on the same key (whether it worked or not), so two writes to one step
 * reach the database in the order the person made them. Returns the write's own promise.
 */
export function chain<T>(queue: Map<string, Promise<unknown>>, k: string, write: () => Promise<T>): Promise<T> {
  const prev = queue.get(k) ?? Promise.resolve();
  const next = prev.then(write, write);
  queue.set(k, next);
  return next;
}
