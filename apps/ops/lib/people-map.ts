// Pure logic for the Board members page (unit-tested in tests/people-map.test.ts): turning database rows into the page's
// shape (lib/people-view.ts), the words the page says ("Yesterday", "Invited", the drafted nudge), who the stale callout
// names, and the two guards the page keeps on the browser side (who may change whose admin rights, and when a local role
// change has been confirmed by the server). No reads, no React.
import { daysFrom, easternDay, clock, MO, fullDate, shortDate, weekday, atDay } from './refresh-time';
import { isStaffRole, type StaffRole } from './role';
import type { PeopleAreaIcon, PeopleInterview, PeoplePerson, PeopleTask, PeopleWork } from './people-view';

export type Row = Record<string, unknown>;

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/** The admin-only rights, as the "What admin rights add" list shows them (the same set as lib/role.ts ADMIN_RIGHTS_LIST). */
export const RIGHTS = ['Change cycle settings', 'Open interview times', 'Send decisions', 'Export applicant lists', 'Delete finance records', 'Give or remove admin rights'];

/** The note under the rights list. */
export const RIGHTS_NOTE = 'Everything else is open to every board member. No one can remove their own admin rights.';

/** How many open tasks a person's detail lists before "N more in Tasks". */
export const TASKS_SHOWN = 5;

/** A gap this many days or longer since the last sign-in is "old" (gold-ink mark) and can put the person in the callout. */
export const STALE_DAYS = 3;

/* ------------------------------------------------------------------------------------------------------------------ */
/* Rows -> people                                                                                                     */

/**
 * The board members: staff_profiles rows (in the order read: created_at) joined to staff_directory() rows (role and last
 * sign-in, by user_id). A profile with no directory row or with a role that is not a staff role is left out (as the old
 * page did): only 'admin' and 'board' are board members.
 */
export function mapPeople(profiles: Row[], directory: Row[]): PeoplePerson[] {
  const dir = new Map(directory.map((d) => [str(d.user_id), d]));
  const out: PeoplePerson[] = [];
  for (const p of profiles) {
    const id = str(p.user_id);
    const d = dir.get(id);
    if (!d || !isStaffRole(d.role)) continue;
    const name = str(p.display_name).trim() || 'Board member';
    const last = str(d.last_sign_in_at);
    out.push({
      id,
      name,
      initials: str(p.initials).trim() || initials(name),
      title: str(p.title).trim() || null,
      role: d.role,
      lastDay: last ? easternDay(last) : null,
      nameIsEmail: name.includes('@'),
    });
  }
  return out;
}

/** Two-letter initials from a name ("Dana Mercer" -> "DM"). */
export function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Rows -> work                                                                                                       */

const AREAS: Record<string, { name: string; icon: PeopleAreaIcon }> = {
  scholarships: { name: 'Scholarships', icon: 'cap' },
  finance: { name: 'Finance', icon: 'money' },
  programs: { name: 'Programs', icon: 'flag' },
  outreach: { name: 'Outreach', icon: 'mega' },
};

/** The area's words and icon for a task's `area` slug ("scholarships" -> Scholarships, cap). Unknown slugs are capitalized. */
export function areaOf(slug: unknown): { name: string; icon: PeopleAreaIcon | null } {
  const s = str(slug).trim().toLowerCase();
  if (!s) return { name: '', icon: null };
  return AREAS[s] ?? { name: s[0].toUpperCase() + s.slice(1), icon: null };
}

/** An open task: not archived, status open or in progress. */
export function isOpenTask(t: Row): boolean {
  return t.archived !== true && (t.status === 'open' || t.status === 'in_progress');
}

/** Soonest due first; undated last; then by title, so the order is stable. */
function byDue(a: PeopleTask, b: PeopleTask): number {
  if (a.dueOn !== b.dueOn) {
    if (!a.dueOn) return 1;
    if (!b.dueOn) return -1;
    return a.dueOn < b.dueOn ? -1 : 1;
  }
  return a.title.localeCompare(b.title);
}

/** A booked interview, as the Today loader joins it (lib/today-map.ts joinBooked). */
export type Booked = { slotId: string; code: string; name: string; startsAt: string; interviewerA: string | null; interviewerB: string | null };

/**
 * Each person's open work: the open tasks assigned to them (task_assignees; group tasks with no person count for nobody),
 * soonest first, the first TASKS_SHOWN listed and the rest counted; and the booked interviews still ahead that they sit
 * on, soonest first. Every person gets an entry, so "Nothing open" is a fact, never a missing read.
 */
export function mapWork(people: PeoplePerson[], tasks: Row[], assignees: Row[], booked: Booked[], nowIso: string): Record<string, PeopleWork> {
  const open = new Map<string, PeopleTask>();
  for (const t of tasks) {
    if (!isOpenTask(t)) continue;
    const a = areaOf(t.area);
    const due = str(t.due_on).slice(0, 10);
    open.set(str(t.id), { id: str(t.id), title: str(t.title), area: a.name, icon: a.icon, dueOn: due || null, note: null, waitsOn: null });
  }
  const mine = new Map<string, PeopleTask[]>();
  const seen = new Set<string>();
  for (const a of assignees) {
    const t = open.get(str(a.task_id));
    const who = str(a.user_id);
    const key = `${who}|${str(a.task_id)}`;
    if (!t || seen.has(key)) continue;
    seen.add(key);
    mine.set(who, [...(mine.get(who) ?? []), t]);
  }
  const now = Date.parse(nowIso);
  const ahead = booked.filter((b) => Date.parse(b.startsAt) > now).sort((x, y) => x.startsAt.localeCompare(y.startsAt));
  const out: Record<string, PeopleWork> = {};
  for (const p of people) {
    const all = (mine.get(p.id) ?? []).sort(byDue);
    const ivs: PeopleInterview[] = ahead
      .filter((b) => b.interviewerA === p.id || b.interviewerB === p.id)
      .map((b) => ({
        id: b.slotId,
        applicant: b.name,
        code: b.code,
        day: easternDay(b.startsAt),
        time: clock(b.startsAt),
        mateId: (b.interviewerA === p.id ? b.interviewerB : b.interviewerA) ?? null,
      }));
    out[p.id] = { tasks: all.slice(0, TASKS_SHOWN), more: Math.max(0, all.length - TASKS_SHOWN), waiting: [], interviews: ivs };
  }
  return out;
}

/** The empty work entry (a person with nothing open). */
export const NO_WORK: PeopleWork = { tasks: [], more: 0, waiting: [], interviews: [] };

/** How many open tasks a person has (listed plus the rest). */
export function taskCount(w: PeopleWork): number {
  return w.tasks.length + w.more;
}

/** "99+" past 99. */
export function cnt(n: number): string {
  return n > 99 ? '99+' : String(n);
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */

/** The "Signed in" word: "Invited" (never signed in), "Today", "Yesterday", the weekday this past week, else "Oct 2". */
export function lastWord(today: string, lastDay: string | null): string {
  if (!lastDay) return 'Invited';
  const n = daysFrom(today, lastDay);
  if (n >= 0) return 'Today';
  if (n === -1) return 'Yesterday';
  if (n >= -6) return weekday(lastDay);
  const d = atDay(lastDay);
  return `${MO[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** The hover title of the "Signed in" word. */
export function lastTitle(lastDay: string | null): string {
  return lastDay ? `Last signed in ${fullDate(lastDay)}` : 'Invited, not signed in yet';
}

/** True when the last sign-in was STALE_DAYS or more days ago (drawn as the gold-ink "old" mark). */
export function isOld(today: string, lastDay: string | null): boolean {
  return !!lastDay && daysFrom(today, lastDay) <= -STALE_DAYS;
}

/** "8 · 1 with admin rights". */
export function summary(people: { role: StaffRole }[]): string {
  return `${people.length} · ${people.filter((p) => p.role === 'admin').length} with admin rights`;
}

/** The first word of a name ("Dana Mercer" -> "Dana"). */
export function firstName(name: string): string {
  return name.split(' ')[0];
}

/**
 * The one person the gold callout names: the longest since signing in, STALE_DAYS or more days ago, never the viewer and
 * never someone who has not signed in yet. Ties keep the list's order. Null when nobody qualifies.
 */
export function staleOf(people: PeoplePerson[], me: string, today: string): PeoplePerson | null {
  const c = people
    .filter((p) => p.id !== me && p.lastDay)
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (a.p.lastDay! === b.p.lastDay! ? a.i - b.i : a.p.lastDay! < b.p.lastDay! ? -1 : 1))[0]?.p;
  return c && isOld(today, c.lastDay) ? c : null;
}

/**
 * The drafted nudge for a person, built from what waits on them: the viewer's task that waits on them (mock sample), else
 * their soonest task plus their first interview, else their first interview, else a plain check-in. `interviewsStart` is
 * the day interviews start: on that day the interview line says "interviews started today".
 */
export function draftNudge(p: PeoplePerson, w: PeopleWork, opts: { me: string; today: string; interviewsStart: string | null; nameOf: (id: string) => string | null }): string {
  const first = firstName(p.name);
  const ask = w.waiting.find((t) => t.ask)?.ask;
  if (ask) return ask;
  const iv = w.interviews[0];
  const t = w.tasks[0];
  const mate = iv?.mateId ? (iv.mateId === opts.me ? 'me' : (opts.nameOf(iv.mateId) ?? null)) : null;
  const ivTxt = iv ? `${iv.applicant}, ${shortDate(iv.day)} at ${iv.time}${mate ? `, with ${mate}` : ''}` : '';
  if (t) {
    const when = t.dueOn ? ` is due ${shortDate(t.dueOn)}` : ' is still open';
    return `Hi ${first}, a reminder that "${t.title}"${when}.${iv ? ` Your first interview is ${ivTxt}.` : ''}`;
  }
  if (iv) return opts.interviewsStart === opts.today ? `Hi ${first}, interviews started today. Yours is ${ivTxt}.` : `Hi ${first}, your first interview is ${ivTxt}.`;
  return `Hi ${first}, checking in.`;
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Guards                                                                                                             */

/**
 * Whether the viewer is offered "Give admin rights" / "Remove admin rights" on a person: only a viewer with admin rights,
 * never on their own row, and only where the write exists. The server action re-checks all of it from the auth server
 * (lib/people-actions.ts changeRoleAction), so this only decides what is drawn.
 */
export function canChangeRole(viewerRole: StaffRole, me: string, personId: string, capable: boolean): boolean {
  return capable && viewerRole === 'admin' && personId !== me;
}

/** The role a rights button sets: there are only two, so a board member is offered admin rights and an admin is offered board. */
export function offeredRole(role: StaffRole): StaffRole {
  return role === 'board' ? 'admin' : 'board';
}

/**
 * The page's rights changes (the board's role state; components/people/people-board.tsx draws only through the functions
 * below). `over`: roles the server confirmed, drawn on top of the loaded data until new data is taken in. `pending`: the one
 * write per person still waiting for its answer, with its sequence number (newest highest); a pending role is never drawn.
 */
export type RoleState = { over: Record<string, StaffRole>; pending: Record<string, { seq: number; to: StaffRole }> };
export const NO_ROLE_CHANGES: RoleState = { over: {}, pending: {} };

/** The role a row draws: the confirmed change if any, else the loaded one. A change still being saved is not drawn. */
export function shownRole(s: RoleState, p: { id: string; role: StaffRole }): StaffRole {
  return s.over[p.id] ?? p.role;
}

/**
 * Whether the viewer may start a rights change on `p` now: admin rights, never their own row, the write exists, a real
 * account (not an invited address), and no change on that person still saving (one at a time per person).
 */
export function canStartRole(s: RoleState, viewerRole: StaffRole, me: string, p: { id: string; nameIsEmail: boolean }, capable: boolean): boolean {
  return canChangeRole(viewerRole, me, p.id, capable) && !p.nameIsEmail && !s.pending[p.id];
}

/**
 * Takes in newly loaded data. Only when no rights change is still saving (`busy` = 0) and no refresh is pending is the
 * loaded data the truth: then every confirmed override is dropped. Otherwise nothing changes (the data may predate a change
 * the page just made). Returns the same object when nothing changed, so React skips a render.
 */
export function takeIn(s: RoleState, busy: number, refreshing: boolean): RoleState {
  if (busy > 0 || refreshing || !Object.keys(s.over).length) return s;
  return { ...s, over: {} };
}

/** Starts write number `seq` of `to` on person `id`. */
export function startRole(s: RoleState, id: string, to: StaffRole, seq: number): RoleState {
  return { ...s, pending: { ...s.pending, [id]: { seq, to } } };
}

/**
 * What a write's answer did. `ok`: the server made the change (it is drawn from now on). `refused`: the server said no
 * or the call failed; the override is dropped (the loaded role shows). `unknown`: no answer in time; the override is dropped
 * and the page claims neither. `stale`: not this person's newest write (kept as a guard; the board starts no second write
 * on a person while one is saving).
 */
export type RoleOutcome = 'stale' | 'ok' | 'refused' | 'unknown';

/** Settles write `seq` on person `id` with the server's answer. */
export function settleRole(s: RoleState, id: string, seq: number, res: { ok: boolean; unknown?: boolean }): { state: RoleState; outcome: RoleOutcome } {
  const w = s.pending[id];
  if (!w || w.seq !== seq) return { state: s, outcome: 'stale' };
  const pending = { ...s.pending };
  delete pending[id];
  const over = { ...s.over };
  if (res.ok) over[id] = w.to;
  else delete over[id];
  return { state: { ...s, pending, over }, outcome: res.ok ? 'ok' : res.unknown ? 'unknown' : 'refused' };
}

/**
 * The person the gold callout is about: the person it was pinned to (by an Edit or a send) while they are still listed,
 * else the member away longest now. A refresh that changes who is away longest never moves a callout someone is using.
 */
export function calloutPerson<P extends { id: string }>(pinned: string | null, stale: P | null, people: P[]): P | null {
  return (pinned ? people.find((p) => p.id === pinned) : undefined) ?? stale;
}

/**
 * A nudge's send state on one person, shared by the gold callout and that person's row: one send in flight per person.
 * `failed` names the control whose send failed (only that control shows Retry); `sent` is the time it saved.
 */
export type NudgeSend = { sending?: boolean; failed?: 'needs' | 'row'; sent?: string };

/**
 * What the gold callout draws for the person it is about now (`staleId`). Everything is read by that id, so when a
 * refresh changes who the callout is for, nothing from the earlier person carries over: "Sent" shows only for the person
 * it was sent to, Retry only where that person's send failed in the callout, and Send/Retry always go to `staleId`.
 */
export function nudgeBox(staleId: string, sends: Record<string, NudgeSend>, editFor: string | null): { state: 'idle' | 'sending' | 'failed' | 'sent'; at: string; editing: boolean; to: string } {
  const st = sends[staleId] ?? {};
  const state = st.sent ? 'sent' : st.sending ? 'sending' : st.failed === 'needs' ? 'failed' : 'idle';
  return { state, at: st.sent ?? '', editing: editFor === staleId, to: staleId };
}

/** The line after a rights change: "Keith Dawson now has admin rights", "... has admin rights again", "... no longer has admin rights". */
export function changedLine(name: string, to: StaffRole, undone: boolean): string {
  if (to === 'admin') return undone ? `${name} has admin rights again` : `${name} now has admin rights`;
  return `${name} no longer has admin rights`;
}

/**
 * The mock-only demo flags this page reads from `?demo=`. In live mode every flag is off (the page shows only real data).
 * `failsend`: a nudge's send fails, so the "Not sent" line and Retry can be seen; `failrole`: a rights change is refused.
 */
export function peopleDemo(demo: string | undefined, live: boolean): { failSend: boolean; failRole: boolean } {
  if (live) return { failSend: false, failRole: false };
  return { failSend: demo === 'failsend', failRole: demo === 'failrole' };
}
