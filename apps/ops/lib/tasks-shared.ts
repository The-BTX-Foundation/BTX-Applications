// Pure types and helpers for the Tasks page (no server imports, so client components may use them).
import { dateOnlyLabel } from './format';

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

