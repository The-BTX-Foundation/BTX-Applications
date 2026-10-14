// Pure types and helpers for the Tasks page (no server imports, so client components may use them).
import { dateOnlyLabel } from './format';
import { dollars, easternDate, plusDays, sundayOf } from './team-dates';

export type TaskStatus = 'open' | 'in_progress' | 'done' | 'declined';
export type Bucket = 'late' | 'this_week' | 'next_week' | 'later';

/** staff_profiles (user_id, display_name, initials). `table_name` is the shorter name the table column may show. */
export type Person = { user_id: string; display_name: string; initials: string; table_name?: string };

/** task_comments (id, task_id, author_id, body, created_at). */
export type TaskComment = { id: string; task_id: string; author_id: string | null; body: string; created_at: string };

/** One bar of an approval's money breakdown ("Scholarships $2,500"). */
export type ApprovalLine = { label: string; cents: number };

/** The text and numbers an approval task shows in the details panel (tasks.details plus the plan it belongs to). */
export type ApprovalDetail = {
  summary: string[];
  lines: ApprovalLine[];
  /** The bar for a line is its share of this total, in cents. */
  totalCents: number;
  hint: string;
  approveLabel: string;
  /** budget_quarter_plans.id when the approval is a quarter plan's (Approve / Decline also decide the plan). */
  planId?: string;
};

/** What a fixture (or a live row) provides; the loader adds the date labels. Column names follow `tasks`. */
export type TaskSeed = {
  id: string;
  title: string;
  /** The title on a phone, where it is shorter. */
  phone_title?: string;
  /** task_types.code and label */
  type: string;
  type_label: string;
  /** areas.slug and name */
  area: string;
  area_name: string;
  status: TaskStatus;
  due_on: string | null;
  /** The phone's date line when it is not just "Oct 6" ("Oct 5-9"). */
  due_note?: string;
  bucket: Bucket;
  owner_id: string | null;
  /** The checklist the task belongs to, for the second line ("Fall 2026 cycle", "Q4 budget"). */
  context: string | null;
  /** A last bit on the second line ("1 started"). */
  extra?: string;
  /** "Q4 budget · 2 of 4 done, now Approve" (the panel's Checklist column). */
  checklist?: string;
  /** Shows under Mine / Team. */
  mine: boolean;
  team: boolean;
  comment_count: number;
  /** The phone's main button on a late row ("Add links"). */
  action?: string;
  approval?: ApprovalDetail;
};

export type TaskItem = TaskSeed & {
  /** "Fri Oct 2" */
  due_label: string;
  /** "Tue" */
  weekday: string;
  /** "Oct 6" */
  short_date: string;
  /** Days past due (0 when not late). */
  late_days: number;
  /** "Tomorrow" for the next day, else null. */
  rel: string | null;
};

export type Counts = { mine: number; team: number; approvals: number; open: number; done_week: number };

export type TasksData = {
  failed: boolean;
  /** mock: writes only change this page's state; live: writes go to the draft tables. */
  mode: 'mock' | 'live';
  today: string;
  me: string;
  people: Person[];
  areas: { slug: string; name: string }[];
  tasks: TaskItem[];
  comments: Record<string, TaskComment[]>;
  counts: Counts;
  done: { id: string; title: string }[];
  /** False for reviewers: they cannot read or write comments, or add tasks (admin + board only). Missing = true. */
  canEdit?: boolean;
};

const DAY = 86_400_000;

// Whole days from `a` to `b` (both "2026-10-04").
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY);
}

// Adds the date labels to a seed.
export function decorate(s: TaskSeed, today: string): TaskItem {
  const d = s.due_on;
  const diff = d ? daysBetween(today, d) : 0;
  const weekday = d ? dateOnlyLabel(d).split(' ')[0] : '';
  const dl = d ? dateOnlyLabel(d) : '';
  return {
    ...s,
    due_label: dl,
    weekday,
    short_date: dl.split(' ').slice(1).join(' '),
    late_days: d && diff < 0 ? -diff : 0,
    rel: d && diff === 1 ? 'Tomorrow' : null,
  };
}

// "N days late" or "1 day late".
export function lateText(n: number): string {
  return `${n} day${n === 1 ? '' : 's'} late`;
}


// Which group a due date falls in. Weeks run Sunday to Saturday: before today is late, the rest of this week is "This
// week", the next Sunday to Saturday "Next week", anything after (or no date) "Later".
export function bucketFor(today: string, due: string | null): Bucket {
  if (!due) return 'later';
  if (due < today) return 'late';
  const sat = plusDays(sundayOf(today), 6);
  if (due <= sat) return 'this_week';
  if (due <= plusDays(sat, 7)) return 'next_week';
  return 'later';
}

/** The raw rows the live loader reads (column names as in the tables). */
export type TasksRaw = {
  tasks: {
    id: string;
    title: string;
    type: string;
    area: string;
    status: TaskStatus;
    due_on: string | null;
    checklist_id: string | null;
    position?: number | null;
    note: string | null;
    details: string | null;
    assignee_group: string | null;
    completed_at: string | null;
  }[];
  assignees: { task_id: string; user_id: string }[];
  types: { code: string; label: string }[];
  areas: { slug: string; name: string }[];
  checklists: { id: string; title: string; budget_plan_id: string | null }[];
  comments: TaskComment[];
  people: Person[];
  plans: { id: string; year: number; quarter: number }[];
  planLines: { plan_id: string; category_id: string; amount_cents: number }[];
  /** budget_category_totals: each category's year, budget and spending so far. */
  categories: { id: string; name: string; year?: number; budget_cents?: number; spent_cents?: number }[];
};

const QUARTER_MONTHS = ['', 'January to March', 'April to June', 'July to September', 'October to December'];

// The details panel of an approval task: tasks.details as the summary lines, plus its quarter plan's lines when the task
// sits on a budget plan's checklist.
export function approvalDetail(
  details: string | null,
  plan: { id: string; quarter: number; year?: number } | undefined,
  lines: ApprovalLine[],
  year?: { spentCents: number; budgetCents: number },
): ApprovalDetail {
  const total = lines.reduce((n, l) => n + l.cents, 0);
  const months = plan ? QUARTER_MONTHS[plan.quarter] ?? '' : '';
  const summary = (details ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (summary.length === 0 && plan) {
    summary.push(`Q${plan.quarter} plan: ${dollars(total)} for ${months}.`);
    if (year && year.budgetCents > 0) summary.push(`${plan.year ?? ''} so far: ${dollars(year.spentCents)} spent of ${dollars(year.budgetCents)}.`.trim());
  }
  return {
    summary,
    lines: [...lines].sort((a, b) => b.cents - a.cents),
    totalCents: total,
    hint: plan ? `Approving sets the budget for ${months}` : 'Approving marks this done',
    approveLabel: plan ? `Approve ${dollars(total)} for Q${plan.quarter}` : 'Approve',
    planId: plan?.id,
  };
}

// Builds the Tasks page data from the raw rows: open tasks with their owner, labels and bucket, the comments, the
// counts and what was done this week. `me` is the signed-in person's user id, `today` Eastern ("2026-10-12").
export function buildTasks(raw: TasksRaw, me: string, today: string): Omit<TasksData, 'failed' | 'mode' | 'canEdit'> {
  const typeLabel = new Map(raw.types.map((t) => [t.code, t.label]));
  const areaName = new Map(raw.areas.map((a) => [a.slug, a.name]));
  const owners = new Map<string, string[]>();
  for (const a of raw.assignees) owners.set(a.task_id, [...(owners.get(a.task_id) ?? []), a.user_id]);
  const lists = new Map(raw.checklists.map((c) => [c.id, c]));
  const commentsBy: Record<string, TaskComment[]> = {};
  for (const c of [...raw.comments].sort((a, b) => a.created_at.localeCompare(b.created_at))) (commentsBy[c.task_id] ??= []).push(c);
  const catName = new Map(raw.categories.map((c) => [c.id, c.name]));
  const known = new Set(raw.people.map((p) => p.user_id));

  const open = raw.tasks
    .filter((t) => t.status === 'open' || t.status === 'in_progress')
    .sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999') || a.title.localeCompare(b.title));
  const items: TaskItem[] = open.map((t) => {
    const who = owners.get(t.id) ?? [];
    const owner = who.find((id) => id === me) ?? who.find((id) => known.has(id)) ?? who[0] ?? null;
    const list = t.checklist_id ? lists.get(t.checklist_id) : undefined;
    let checklist: string | undefined;
    if (list) {
      const steps = raw.tasks.filter((x) => x.checklist_id === list.id);
      checklist = `${list.title} · ${steps.filter((x) => x.status === 'done').length} of ${steps.length} done`;
    }
    let approval: ApprovalDetail | undefined;
    if (t.type === 'approval') {
      const plan = list?.budget_plan_id ? raw.plans.find((p) => p.id === list.budget_plan_id) : undefined;
      const lines = plan ? raw.planLines.filter((l) => l.plan_id === plan.id).map((l) => ({ label: catName.get(l.category_id) ?? 'Category', cents: Number(l.amount_cents) })) : [];
      const cats = plan ? raw.categories.filter((c) => c.year === plan.year) : [];
      const year = { spentCents: cats.reduce((n, c) => n + (c.spent_cents ?? 0), 0), budgetCents: cats.reduce((n, c) => n + (c.budget_cents ?? 0), 0) };
      approval = approvalDetail(t.details, plan, lines, year);
    }
    const seed: TaskSeed = {
      id: t.id,
      title: t.title,
      type: t.type,
      type_label: typeLabel.get(t.type) ?? t.type.replace(/^./, (c) => c.toUpperCase()),
      area: t.area,
      area_name: areaName.get(t.area) ?? t.area,
      status: t.status,
      due_on: t.due_on,
      bucket: bucketFor(today, t.due_on),
      owner_id: owner,
      context: list?.title ?? t.note ?? null,
      checklist,
      mine: who.includes(me),
      team: true,
      comment_count: commentsBy[t.id]?.length ?? 0,
      approval,
    };
    return decorate(seed, today);
  });

  const weekStart = sundayOf(today);
  const done = raw.tasks
    .filter((t) => t.status === 'done' && t.completed_at && easternDate(t.completed_at) >= weekStart)
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
    .map((t) => ({ id: t.id, title: t.title }));

  return {
    today,
    me,
    people: raw.people,
    areas: raw.areas.map((a) => ({ slug: a.slug, name: a.name })),
    tasks: items,
    comments: commentsBy,
    counts: {
      mine: items.filter((t) => t.mine).length,
      team: items.length,
      approvals: items.filter((t) => t.type === 'approval').length,
      open: items.length,
      done_week: done.length,
    },
    done,
  };
}
