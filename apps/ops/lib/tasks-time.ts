// The Tasks page's own pure rules: which tab and filters show a task, what a row and its detail may offer (the approval
// rule that keeps backlog B16 impossible), the news card under the title, the add-a-task parser with the area filter
// pre-filled, comment times and counts. Shared time words come from lib/refresh-time.ts (through lib/today-time.ts).
// Reference: the demo's script (apps/design/ops-refresh/directions/p-tasks/index.html). Unit tested in tests/tasks-time.test.ts.
import { daysFrom, daysToSunday, easternDay, clock, fullDate, groupOf, parseTask, rel, shortDate, TODAY_GROUPS, weekday, type ParsedTask, type TodayGroup } from './today-time';
import type { TasksCaps, TasksKind, TasksTask } from './tasks-view';
import { dollars } from './daily-tasks';

export { groupOf, rel, shortDate, fullDate, weekday, daysFrom };

/** The list's groups in drawing order, with their headings (the same as Today's). */
export const TASK_GROUPS: [TodayGroup, string][] = TODAY_GROUPS;

/** The page's three tabs. */
export type TasksTab = 'mine' | 'team' | 'appr';

/** The filters in play. `who` is a person id (Team tab only), `area` an area name, `q` the search words. */
export type TasksFilter = { tab: TasksTab; who: string; area: string; q: string };

/** "99+" past 99. */
export function cnt(n: number): string {
  return n > 99 ? '99+' : String(n);
}

/** The starting tab from `?tab=` (the old page said "approvals", the demo says "appr"). */
export function startTab(tab: string | undefined): TasksTab {
  if (tab === 'team') return 'team';
  if (tab === 'approvals' || tab === 'appr') return 'appr';
  return 'mine';
}

/** True when the task belongs on the tab: Mine = the viewer's, Approvals = the viewer's approvals, Team = everything. */
export function inTab(t: Pick<TasksTask, 'mine' | 'kind'>, tab: TasksTab): boolean {
  if (tab === 'mine') return t.mine;
  if (tab === 'appr') return t.mine && t.kind === 'approval';
  return true;
}

/** True when the task passes the tab, the person (Team only), the area (unless `noArea`) and the search words. */
export function matches(t: Pick<TasksTask, 'mine' | 'kind' | 'ownerId' | 'ownerIds' | 'areaName' | 'title'>, f: TasksFilter, o: { noArea?: boolean } = {}): boolean {
  if (!inTab(t, f.tab)) return false;
  // The person filter matches ANY owner of the task, not only the first.
  if (f.tab === 'team' && f.who && !(t.ownerIds ?? (t.ownerId ? [t.ownerId] : [])).includes(f.who)) return false;
  if (!o.noArea && f.area && t.areaName !== f.area) return false;
  const q = f.q.trim().toLowerCase();
  if (q && !t.title.toLowerCase().includes(q)) return false;
  return true;
}

/**
 * What a row may offer. The availability prompt (`stored` false) offers nothing but its link. An approval NEVER gets a check
 * (it is finished by approving, not ticking) and gets Snooze and the swipe's Review only when approvals are decided on this
 * page (`approveInPlace`, mock mode). In live mode an approval row has no check, no snooze and no swipe tray: its chevron
 * opens the detail and its Review link goes to /finance/budget/approval (backlog B16: no "Mark done" on a late approval).
 */
export function taskRowActions(t: Pick<TasksTask, 'kind' | 'stored'>, caps: Pick<TasksCaps, 'done' | 'snooze' | 'approveInPlace'>): { check: boolean; snooze: boolean; review: boolean } {
  if (!t.stored) return { check: false, snooze: false, review: false };
  if (t.kind === 'approval') {
    const inPlace = caps.approveInPlace;
    return { check: false, snooze: inPlace && caps.snooze, review: inPlace };
  }
  return { check: caps.done, snooze: caps.snooze, review: false };
}

/** What the open detail may offer. "Mark done" never shows on an approval; approve / decline only with `approveInPlace`. */
export function detailActions(
  t: Pick<TasksTask, 'kind' | 'stored' | 'checklist' | 'approval'>,
  caps: TasksCaps,
): { markDone: boolean; snooze: boolean; approve: boolean; decline: boolean; reason: boolean; review: boolean; tick: boolean; comment: boolean } {
  const approval = t.kind === 'approval';
  const inPlace = approval && caps.approveInPlace && !!t.approval;
  return {
    markDone: t.stored && !approval && caps.done,
    snooze: t.stored && !approval && caps.snooze,
    approve: t.stored && inPlace,
    decline: t.stored && inPlace,
    reason: t.stored && inPlace && caps.declineReason,
    // Live (or an approval without a plan): the way to decide it is the approval page.
    review: approval && !inPlace,
    // Approval steps are never ticked by hand (the gold button is that step).
    tick: t.stored && !approval && caps.checklist && !!t.checklist,
    comment: t.stored && caps.comment,
  };
}

/** The row's icon, kind word and tint class (the demo's kindOf): gold-ink for approvals, late rows and the viewer's own on Team. */
export function kindOf(kind: TasksKind, late: boolean, mineOnTeam: boolean): { icon: 'approve' | 'mega' | 'score' | 'cal' | 'video' | 'send' | 'task'; word: string; cls: string } {
  const tint = late || mineOnTeam ? ' rf-k-tint' : '';
  switch (kind) {
    case 'approval':
      return { icon: 'approve', word: 'Approval', cls: ' rf-k-gold' };
    case 'post':
      return { icon: 'mega', word: 'Post', cls: tint };
    case 'scoring':
      return { icon: 'score', word: 'Scoring', cls: tint };
    case 'schedule':
    case 'request':
      return { icon: 'cal', word: kind === 'request' ? 'Request' : '', cls: tint };
    case 'prep':
      return { icon: 'video', word: '', cls: tint };
    case 'remind':
      return { icon: 'send', word: '', cls: tint };
    default:
      return { icon: 'task', word: '', cls: tint };
  }
}

/** "today", "tomorrow", "Thursday", "next Monday", or "Monday, November 23" (the news card's "Next · due ..."). */
export function relWords(today: string, day: string): string {
  const n = daysFrom(today, day);
  const long = fullDate(day);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  const toSun = daysToSunday(today);
  if (n > 1 && n <= toSun) return long.split(',')[0];
  if (n > toSun && n <= toSun + 7) return `next ${long.split(',')[0]}`;
  return long;
}

/** The news card under the title: the viewer's first approval, else their late task, else what is due next; null when clear. */
export type TasksNews = { id: string; kicker: string; title: string; go: string; icon: 'money' | 'alert' | 'clock'; gold: boolean };

/** Picks the news from the viewer's open tasks (in list order). Prompts that are not stored tasks are left out. */
export function nextUp(today: string, open: Pick<TasksTask, 'id' | 'title' | 'kind' | 'dueOn' | 'mine' | 'stored'>[]): TasksNews | null {
  const mine = open.filter((t) => t.mine && t.stored);
  const appr = mine.filter((t) => t.kind === 'approval');
  if (appr.length) return { id: appr[0].id, kicker: appr.length > 1 ? `${appr.length} approvals` : 'Needs your approval', title: appr[0].title, go: 'Review', icon: 'money', gold: true };
  const late = mine.filter((t) => t.dueOn && daysFrom(today, t.dueOn) < 0);
  if (late.length) return { id: late[0].id, kicker: late.length > 1 ? `${late.length} late` : rel(today, late[0].dueOn), title: late[0].title, go: 'Open', icon: 'alert', gold: false };
  const next = mine.filter((t) => t.dueOn).sort((a, b) => (a.dueOn ?? '').localeCompare(b.dueOn ?? ''))[0];
  if (next?.dueOn) return { id: next.id, kicker: `Next · due ${relWords(today, next.dueOn)}`, title: next.title, go: 'Open', icon: 'clock', gold: false };
  return null;
}

/**
 * The add field's reading (Today's parser): with an area filter on and no area word typed, the new task takes the
 * filter's area, unless the person tapped the area chip away.
 */
export function parseAdd(today: string, text: string, dismissed: { date: boolean; area: boolean }, filterArea: string): ParsedTask {
  const p = parseTask(today, text, dismissed);
  if (!p.area && filterArea && !dismissed.area && text.trim()) return { ...p, area: filterArea };
  return p;
}

/** A comment's time in words: "Mon 4:40 PM" within the last six days, else "Nov 3" (Eastern time). */
export function commentWhen(today: string, instant: string): string {
  const day = easternDay(instant);
  const n = daysFrom(today, day);
  if (n <= 0 && n > -7) return `${weekday(day)} ${clock(instant)}`;
  return shortDate(day).split(' ').slice(1).join(' ');
}

/** The empty line for the filters in play (the demo's emptyHTML), and whether "Clear filters" shows. */
export function emptyLine(f: TasksFilter, whoName: string | null): { text: string; clear: boolean } {
  const bits: string[] = [];
  if (f.area) bits.push(`in ${f.area}`);
  if (f.tab === 'team' && f.who && whoName) bits.push(`for ${whoName}`);
  if (f.q.trim()) bits.push(`matching “${f.q.trim()}”`);
  if (bits.length) return { text: `Nothing open ${bits.join(' ')}.`, clear: true };
  if (f.tab === 'appr') return { text: 'Nothing waits for your approval.', clear: false };
  return { text: "You're clear. Nothing open.", clear: false };
}

/** Sorts a group's tasks: soonest due first, undated last, then in the order the data gave them. */
export function byDue<T extends { dueOn: string | null }>(items: T[], order: (t: T) => number): T[] {
  return [...items].sort((a, b) => (a.dueOn ?? '9999-12-31').localeCompare(b.dueOn ?? '9999-12-31') || order(a) - order(b));
}

/** "$4,830" from cents, or "$4,830.50" when there are cents (the same rule as the approve button's label). */
export function money(cents: number): string {
  return dollars(cents);
}
