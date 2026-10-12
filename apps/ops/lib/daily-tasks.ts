// Pure logic for the Tasks page, the Today page and the sidebar counts: row -> view model, due-date buckets, headline.
// No server imports, so it is unit-tested (tests/daily-tasks.test.ts).
import { dateOnlyLabel } from './format';
import { daysBetween, decorate, type ApprovalDetail, type Bucket, type Counts, type Person, type TaskComment, type TaskItem, type TaskSeed, type TaskStatus } from './tasks-shared';
import type { OverviewArea, TaskGroup, TaskRow, TodayData } from '@/mock/today';
import type { OpsIconName } from '@/components/icons';

export type Raw = Record<string, unknown>;

/** An Eastern-time calendar date ("2026-10-05") for a moment. */
export function easternDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
}

/** "Sunday, October 4" for a calendar date. */
export function longDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Which group a due date falls in, counted from today: past = late, up to 6 days = this week, up to 13 = next week. */
export function bucketOf(today: string, due: string | null): Bucket {
  if (!due) return 'later';
  const diff = daysBetween(today, due);
  return diff < 0 ? 'late' : diff <= 6 ? 'this_week' : diff <= 13 ? 'next_week' : 'later';
}

/** The end of the Eastern-time week window: the last day counted as "done this week" starts 7 days back. */
export function weekAgo(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 7)).toISOString().slice(0, 10);
}

/** "$4,830" from cents (no cents when whole). */
export function dollars(cents: number): string {
  const v = cents / 100;
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export type LiveInput = {
  me: string;
  today: string;
  tasks: Raw[];
  assignees: Raw[];
  comments: Raw[];
  types: Raw[];
  areas: Raw[];
  checklists: Raw[];
  people: Raw[];
  /** budget_quarter_plans rows, their lines (with category names) and the year's spent figure: approval detail. */
  plans?: Raw[];
  planLines?: { plan_id: string; label: string; cents: number }[];
  spentCents?: number;
  budgetCents?: number;
};

export type LiveTasks = {
  people: Person[];
  areas: { slug: string; name: string }[];
  tasks: TaskItem[];
  comments: Record<string, TaskComment[]>;
  counts: Counts;
  done: { id: string; title: string }[];
};

const str = (v: unknown) => String(v ?? '');
const nullable = (v: unknown) => (v === null || v === undefined ? null : String(v));

/** "Q4 budget · 2 of 4 done, now Approve": the checklist a task belongs to. */
export function checklistLine(title: string, steps: Raw[]): string {
  const live = steps.filter((s) => !s.archived).sort((a, b) => Number(a.position) - Number(b.position));
  const done = live.filter((s) => s.status === 'done').length;
  const next = live.find((s) => s.status !== 'done' && s.status !== 'declined');
  return `${title} · ${done} of ${live.length} done${next ? `, now ${str(next.title)}` : ''}`;
}

/** The text and bars an approval shows, from the quarter plan it belongs to. */
export function approvalDetail(plan: Raw, lines: { label: string; cents: number }[], spent: number | null, budget: number | null): ApprovalDetail {
  const total = lines.reduce((s, l) => s + l.cents, 0);
  const q = Number(plan.quarter);
  const months = ['January to March', 'April to June', 'July to September', 'October to December'][q - 1] ?? '';
  const summary = [`Q${q} plan: ${dollars(total)} for ${months}.`];
  if (spent !== null && budget !== null) summary.push(`${plan.year} so far: ${dollars(spent)} spent of ${dollars(budget)}.`);
  return {
    summary,
    lines: lines.filter((l) => l.cents > 0).sort((a, b) => b.cents - a.cents),
    totalCents: Math.max(1, total),
    hint: `Approving sets the budget for ${months}`,
    approveLabel: `Approve ${dollars(total)} for Q${q}`,
  };
}

/** Everything the Tasks page needs, from the rows the database returned. */
export function buildTasks(i: LiveInput): LiveTasks {
  const people: Person[] = i.people.map((p) => ({ user_id: str(p.user_id), display_name: str(p.display_name), initials: str(p.initials) }));
  const areaName = new Map(i.areas.map((a) => [str(a.slug), str(a.name)]));
  const typeLabel = new Map(i.types.map((t) => [str(t.code), str(t.label)]));
  const lists = new Map(i.checklists.map((c) => [str(c.id), c]));
  const stepsOf = new Map<string, Raw[]>();
  for (const t of i.tasks) {
    const k = nullable(t.checklist_id);
    if (k) stepsOf.set(k, [...(stepsOf.get(k) ?? []), t]);
  }
  const ownersOf = new Map<string, string[]>();
  for (const a of [...i.assignees].sort((x, y) => str(x.assigned_at).localeCompare(str(y.assigned_at)))) {
    ownersOf.set(str(a.task_id), [...(ownersOf.get(str(a.task_id)) ?? []), str(a.user_id)]);
  }
  const commentsBy: Record<string, TaskComment[]> = {};
  for (const c of [...i.comments].sort((x, y) => str(x.created_at).localeCompare(str(y.created_at)))) {
    (commentsBy[str(c.task_id)] ??= []).push({ id: str(c.id), task_id: str(c.task_id), author_id: nullable(c.author_id), body: str(c.body), created_at: str(c.created_at) });
  }
  const plansById = new Map((i.plans ?? []).map((p) => [str(p.id), p]));

  const open = i.tasks.filter((t) => !t.archived && (t.status === 'open' || t.status === 'in_progress'));
  const seeds = open.map((t): TaskSeed => {
    const id = str(t.id);
    const owners = ownersOf.get(id) ?? [];
    const list = nullable(t.checklist_id) ? lists.get(str(t.checklist_id)) : undefined;
    const due = nullable(t.due_on);
    const type = str(t.type);
    const planId = list ? nullable(list.budget_plan_id) : null;
    const plan = planId ? plansById.get(planId) : undefined;
    const lines = (i.planLines ?? []).filter((l) => l.plan_id === planId);
    return {
      id,
      title: str(t.title),
      type,
      type_label: typeLabel.get(type) ?? type.replace(/^./, (c) => c.toUpperCase()),
      area: str(t.area),
      area_name: areaName.get(str(t.area)) ?? str(t.area),
      status: t.status as TaskStatus,
      due_on: due,
      bucket: bucketOf(i.today, due),
      owner_id: owners[0] ?? null,
      context: list ? str(list.title) : null,
      checklist: list ? checklistLine(str(list.title), stepsOf.get(str(list.id)) ?? []) : undefined,
      mine: owners.includes(i.me) || t.assignee_group === 'all_board',
      team: true,
      comment_count: (commentsBy[id] ?? []).length,
      approval: type === 'approval' && plan ? approvalDetail(plan, lines, i.spentCents ?? null, i.budgetCents ?? null) : undefined,
    };
  });
  const tasks = seeds.map((s) => decorate(s, i.today));
  const since = weekAgo(i.today);
  const doneRows = i.tasks.filter((t) => t.status === 'done' && !t.archived && str(t.completed_at).slice(0, 10) >= since);
  return {
    people,
    areas: i.areas.map((a) => ({ slug: str(a.slug), name: str(a.name) })),
    tasks,
    comments: commentsBy,
    counts: {
      mine: tasks.filter((t) => t.mine).length,
      team: tasks.length,
      approvals: tasks.filter((t) => t.type === 'approval').length,
      open: tasks.length,
      done_week: doneRows.length,
    },
    done: doneRows.map((t) => ({ id: str(t.id), title: str(t.title) })),
  };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Today                                                                                                              */

const TYPE_ICON: Record<string, OpsIconName> = { task: 'tasks', post: 'outreach', request: 'calendar', approval: 'approval', scoring: 'scoring', meeting: 'meeting' };

const GROUP_LABEL: Record<Bucket, string> = { late: 'Late', this_week: 'This week', next_week: 'Next week', later: 'Later' };

function phoneDue(t: TaskItem): string {
  if (t.late_days) return `${t.late_days} day${t.late_days === 1 ? '' : 's'} late`;
  if (t.rel) return t.rel;
  if (t.bucket === 'this_week') return t.weekday;
  return t.due_label ? t.short_date : 'No date';
}

/** One Today row from a task. */
export function todayRow(t: TaskItem): TaskRow {
  const late = t.late_days > 0;
  const icon = TYPE_ICON[t.type] ?? 'tasks';
  const plain = t.type === 'task' || t.type === 'post';
  let action: TaskRow['action'];
  let href: string | undefined;
  if (t.type === 'approval') {
    action = { label: t.approval?.approveLabel ?? 'Review', kind: 's' };
    href = '/money/budget/approval';
  } else if (t.type === 'request') {
    action = { label: 'Add times', kind: 's' };
    href = '/scholarships/interviews';
  } else if (t.type === 'scoring') {
    action = { label: 'Score', kind: 's' };
    href = '/scholarships/scoring';
  } else if (late) {
    action = { label: 'Open', kind: 'p' };
  }
  return {
    id: t.id,
    title: t.title,
    phoneTitle: t.phone_title,
    lead: plain ? 'circle' : 'icon',
    typeIcon: icon,
    typeLabel: t.type_label,
    sub: t.context ?? t.area_name,
    comments: t.comment_count || undefined,
    area: t.area_name,
    due: t.due_label,
    rel: late ? { text: `${t.late_days} day${t.late_days === 1 ? '' : 's'} late`, late: true } : t.rel ? { text: t.rel } : undefined,
    action,
    href,
    phoneSub: plain ? t.area_name : `${t.area_name} · ${t.type_label.toLowerCase()}`,
    phoneDue: phoneDue(t),
    phoneLate: late || undefined,
    phoneActions: late ? (action && action.label !== 'Open' ? [{ label: action.label, kind: 'p' }, { label: 'Open', kind: 's' }] : [{ label: 'Open', kind: 'p' }]) : undefined,
    approval: t.type === 'approval' || undefined,
  };
}

/** Rows grouped Late / This week / Next week / Later (empty groups left out). */
export function todayGroups(tasks: TaskItem[]): TaskGroup[] {
  const order: Bucket[] = ['late', 'this_week', 'next_week', 'later'];
  const sorted = [...tasks].sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999'));
  return order.map((b) => ({ label: GROUP_LABEL[b], rows: sorted.filter((t) => t.bucket === b).map(todayRow) })).filter((g) => g.rows.length > 0);
}

/** The page headline: the latest late task of mine, else what is due this week, else all clear. */
export function headline(first: string, mine: TaskItem[]): string {
  const late = mine.filter((t) => t.late_days > 0).sort((a, b) => b.late_days - a.late_days)[0];
  if (late) {
    const title = late.title.replace(/^Send /, '').replace(/^./, (c) => c.toUpperCase());
    return `${title} ${/s$/i.test(title.split(' ').slice(-1)[0]) && !/ss$/i.test(title) ? 'are' : 'is'} ${late.late_days} day${late.late_days === 1 ? '' : 's'} late, ${first}.`;
  }
  const week = mine.filter((t) => t.bucket === 'this_week').length;
  if (week > 0) return `${week} ${week === 1 ? 'thing needs' : 'things need'} you this week, ${first}.`;
  return `You're all caught up, ${first}.`;
}

export type AreaFacts = {
  /** My open tasks per area slug. */
  mineByArea: Record<string, number>;
  /** Checklist progress (done / total) for the ring, per area. */
  ring: Record<string, { done: number; total: number }>;
  cycle: { interviewEnd: string | null; scored: number; applications: number } | null;
  fundsCents: number | null;
  raisedCents: number;
  raiseTargetCents: number | null;
  /** The program's kind (certification, mentorship, sponsorship) is what the card names. */
  programName: string | null;
  programStatus: string | null;
  planningCall: string | null;
  monthName: string;
  postsPlanned: number;
  postsDone: number;
  nextPost: string | null;
};

/** The Overview rings: steps done of all steps. Scholarships = the cycle's tasks, Money = the budget plan checklists' steps,
 *  Programs = the Programs area's tasks. */
export function ringProgress(tasks: Raw[], checklists: Raw[], cycleId: string | null): Record<string, { done: number; total: number }> {
  const live = tasks.filter((t) => !t.archived && t.status !== 'declined');
  const count = (rows: Raw[]) => ({ done: rows.filter((t) => t.status === 'done').length, total: rows.length });
  const budgetLists = new Set(checklists.filter((c) => c.budget_plan_id).map((c) => str(c.id)));
  const cycleLists = new Set(checklists.filter((c) => cycleId !== null && c.cycle_id === cycleId).map((c) => str(c.id)));
  return {
    scholarships: count(live.filter((t) => cycleId !== null && (t.cycle_id === cycleId || cycleLists.has(str(t.checklist_id))))),
    money: count(live.filter((t) => budgetLists.has(str(t.checklist_id)))),
    programs: count(live.filter((t) => t.area === 'programs')),
  };
}

const forYou = (n: number | undefined) => (n ? `${n} for you` : null);
const frac = (r: { done: number; total: number } | undefined) => (r && r.total > 0 ? r.done / r.total : 0);
const label = (r: { done: number; total: number } | undefined) => `${r?.done ?? 0}/${r?.total ?? 0}`;
const PROGRAM_NAME: Record<string, string> = { certification: 'Certifications', mentorship: 'Mentorship', sponsorship: 'Sponsorships' };
const STATUS: Record<string, string> = { planned: 'planned', setting_up: 'in setup', active: 'active', paused: 'paused', ended: 'ended' };

/** The four Overview cards. */
export function overview(f: AreaFacts): OverviewArea[] {
  const sch = f.ring.scholarships;
  const mon = f.ring.money;
  const prog = f.ring.programs;
  const out = f.postsPlanned > 0 ? { done: f.postsDone, total: f.postsPlanned } : undefined;
  return [
    {
      id: 'scholarships',
      name: 'Scholarships',
      ring: { frac: frac(sch), label: label(sch), color: 'gold' },
      big: f.cycle ? `${f.cycle.scored} / ${f.cycle.applications}` : '0 / 0',
      label: 'scored',
      line: f.cycle?.interviewEnd ? `Interviews end ${dateOnlyLabel(f.cycle.interviewEnd)}` : 'No interview dates yet',
      forYou: forYou(f.mineByArea.scholarships),
      href: '/scholarships/cycle',
    },
    {
      id: 'money',
      name: 'Money',
      ring: { frac: frac(mon), label: label(mon), color: 'gold' },
      big: f.fundsCents === null ? 'Not set' : dollars(f.fundsCents),
      label: 'on hand',
      line: f.raiseTargetCents ? `${dollars(f.raisedCents)} of ${dollars(f.raiseTargetCents)} raised` : `${dollars(f.raisedCents)} raised`,
      forYou: forYou(f.mineByArea.money),
      href: '/money/budget',
    },
    {
      id: 'programs',
      name: 'Programs',
      ring: { frac: frac(prog), label: label(prog), color: 'ink' },
      big: (f.programName && PROGRAM_NAME[f.programName]) || f.programName || 'No programs',
      label: f.programStatus ? (STATUS[f.programStatus] ?? f.programStatus) : 'yet',
      line: f.planningCall ?? 'No planning call set',
      forYou: forYou(f.mineByArea.programs),
      href: '/programs/certifications',
    },
    {
      id: 'outreach',
      name: 'Outreach',
      ring: { frac: frac(out), label: label(out), color: 'ink' },
      big: `${f.postsPlanned} ${f.postsPlanned === 1 ? 'post' : 'posts'}`,
      label: `planned in ${f.monthName}`,
      line: f.nextPost ? `Next post ${f.nextPost}` : 'No post scheduled',
      forYou: forYou(f.mineByArea.outreach),
      href: '/outreach/plan',
    },
  ];
}

/** Assembles the Today data. `mine` and `team` are the open tasks; `first` is the person's first name. */
export function buildToday(a: { today: string; first: string; mine: TaskItem[]; team: TaskItem[]; facts: AreaFacts }): TodayData & { teamGroups: TaskGroup[] } {
  return {
    headline: headline(a.first, a.mine),
    dateLine: longDate(a.today),
    counts: { mine: a.mine.length, team: a.team.length, approvals: a.team.filter((t) => t.type === 'approval').length },
    areas: overview(a.facts),
    groups: todayGroups(a.mine),
    teamGroups: todayGroups(a.team),
  };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Sidebar counts                                                                                                     */

/** The gold counts: Today = my open tasks, Board chat = unread, Money / Outreach = my open tasks there, Scoring = what I
 *  still have to score (Scholarships shows the same number while folded). Zero draws no pill. */
export function sidebarCounts(a: { mineOpen: number; unread: number; mineByArea: Record<string, number>; scoringTodo: number }): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  const put = (k: string, n: number) => {
    if (n > 0) out[k] = n > 99 ? '99+' : n;
  };
  put('today', a.mineOpen);
  put('chat', a.unread);
  put('scholarships', a.scoringTodo);
  put('scoring', a.scoringTodo);
  put('money', a.mineByArea.money ?? 0);
  put('outreach', a.mineByArea.outreach ?? 0);
  return out;
}

/** Applications this person interviews (an active booking on a slot they are paired for) and has not published a score for. */
export function scoringTodo(me: string, bookings: Raw[], pairings: Raw[], scores: Raw[]): number {
  const mySlots = new Set(pairings.filter((p) => p.interviewer_a === me || p.interviewer_b === me).map((p) => str(p.slot_id)));
  const done = new Set(scores.filter((x) => x.scorer_id === me && x.published === true).map((x) => str(x.application_id)));
  const apps = new Set(bookings.filter((b) => b.status === 'active' && mySlots.has(str(b.slot_id))).map((b) => str(b.application_id)));
  return [...apps].filter((a) => !done.has(a)).length;
}
