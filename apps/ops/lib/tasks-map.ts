// Pure mapping for the refreshed Tasks page (lib/tasks-view.ts): the live Tasks data (lib/daily-load.ts loadLiveTasks, built
// by lib/daily-tasks.ts) in, the page's view out. No server imports, so it is unit tested with sample data
// (tests/tasks-map.test.ts). Rule: never invent data. What the tables do not hold (who a task waits on, the students to
// remind, the schedule lines, per-step checklist ticks, the year's figures as numbers) stays null and its control is off.
import { approvalHref, dateLabel, taskKind, taskLink } from './today-map';
import { commentWhen } from './tasks-time';
import type { ApprovalDetail, TaskComment, TaskItem, TasksData } from './tasks-shared';
import type { TaskRow } from '@/mock/today';
import type { ApprovalPlan, TasksCaps, TasksPerson, TasksTask, TasksView } from './tasks-view';

/** Where every approval is decided. */
export const APPROVAL_HREF = '/finance/budget/approval';

/**
 * Live mode's capabilities. Each true flag names the real write behind it (components/tasks/tasks-writes.ts):
 * done = tasks.update status/completed_at (undo = the reverse update); add = tasks.insert + task_assignees.insert (the task
 * is deleted again if the owner row fails); comment = task_comments.insert; snooze = tasks.update due_on. Everything else
 * has no write on this page: checklist steps are read-only, approvals (approve, decline, decline reason) are decided on
 * /finance/budget/approval, and nothing stores who a task waits on or which students to remind.
 */
export const LIVE_CAPS: TasksCaps = { done: true, add: true, comment: true, snooze: true, checklist: false, declineReason: false, approveInPlace: false, nudge: false, remind: false };

/** A staff profile as the page names it. */
export function mapPerson(p: { user_id: string; display_name: string; initials: string }): TasksPerson {
  const name = p.display_name.trim() || 'Board member';
  return { id: p.user_id, name, first: name.split(/\s+/)[0], initials: p.initials || name.slice(0, 2).toUpperCase() };
}

/** One comment, its time in words. */
export function mapComment(today: string, c: TaskComment): TasksTask['comments'][number] {
  return { id: c.id, by: c.author_id, at: commentWhen(today, c.created_at), body: c.body };
}

/**
 * An approval's plan from the quarter plan the live data carries ("Q4 plan: $4,830 for October to December." ...). The
 * year's spent and budget figures come only as words there, so the year bar is not drawn (null) in live mode.
 */
export function mapApproval(d: ApprovalDetail): ApprovalPlan {
  const [first = '', ...rest] = d.summary;
  const quarter = first.split(':')[0] || 'Plan';
  const months = d.hint.split(' for ').slice(1).join(' for ');
  return {
    heading: months ? `${quarter}, ${months}` : quarter,
    summary: rest.join(' ') || first,
    totalCents: d.totalCents,
    spentCents: null,
    yearCents: null,
    lines: d.lines.map((l) => ({ label: l.label, cents: l.cents })),
    hint: d.hint.endsWith('.') ? d.hint : `${d.hint}.`,
    approveLabel: d.approveLabel,
    afterHint: '',
    askName: null,
    href: approvalHref(d.planId),
  };
}

/** One open task. `waiting`, `remind` and `schedule` are always null in live mode (no table holds them). */
export function mapTask(today: string, t: TaskItem, comments: TaskComment[], owners: string[] = []): TasksTask {
  const kind = taskKind(t);
  const link = taskLink(kind, t.title);
  return {
    id: t.id,
    title: t.title,
    kind,
    areaName: t.area_name,
    dueOn: t.due_on,
    ownerId: t.owner_id,
    ownerIds: owners.length ? owners : t.owner_id ? [t.owner_id] : [],
    areaSlug: t.area || null,
    status: t.status === 'in_progress' ? 'in_progress' : 'open',
    mine: t.mine,
    // An approval always shows its Review link to the approval page of ITS plan (it is never ticked here).
    link: kind === 'approval' ? { label: 'Review', href: approvalHref(t.approval?.planId) } : link,
    schedule: null,
    waiting: null,
    remind: null,
    checklist: null,
    checklistLine: t.checklist ?? null,
    approval: kind === 'approval' && t.approval ? mapApproval(t.approval) : null,
    comments: comments.map((c) => mapComment(today, c)),
    extra: null,
    stored: true,
  };
}

/**
 * The availability request ("Give your interview availability"): a prompt drawn as a row on Mine with its "Add times" link.
 * Not a stored task, so it has no check, no snooze and no comments.
 */
export function mapRequest(item: { row: TaskRow; due: string | null }, me: string): TasksTask {
  return {
    id: item.row.id,
    title: item.row.phoneTitle ?? item.row.title,
    kind: 'request',
    areaName: item.row.area,
    dueOn: item.due,
    ownerId: me,
    mine: true,
    link: { label: item.row.action?.label ?? 'Add times', href: item.row.href ?? '/scholarships/interviews/availability' },
    schedule: null,
    waiting: null,
    remind: null,
    checklist: null,
    checklistLine: null,
    approval: null,
    comments: [],
    extra: null,
    stored: false,
  };
}

/** The whole live view from the Tasks data (and the availability request, when one is due). */
export function mapTasksView(
  data: Pick<TasksData, 'today' | 'me' | 'people' | 'areas' | 'tasks' | 'comments' | 'done'>,
  request: { row: TaskRow; due: string | null } | null,
  owners: Record<string, string[]> = {},
): TasksView {
  const tasks = data.tasks.map((t) => mapTask(data.today, t, data.comments[t.id] ?? [], owners[t.id] ?? []));
  return {
    today: data.today,
    dateLabel: dateLabel(data.today),
    me: data.me,
    people: data.people.map(mapPerson),
    areas: data.areas.map((a) => a.name),
    areaSlugs: Object.fromEntries(data.areas.map((a) => [a.name, a.slug])),
    tasks: request ? [mapRequest(request, data.me), ...tasks] : tasks,
    done: data.done.map((d) => d.title),
    clock: '',
    caps: LIVE_CAPS,
  };
}
