// Pure types and helpers shared by the Money pages and People and roles (no server imports, so client components may use
// them). Types mirror the draft Ops Hub schema (budget_*, spending_entries, gifts, grants, staff_profiles, staff_directory;
// see supabase/migrations/20261010120000_ops_hub.sql in the ops-schema worktree).
import type { StaffRole } from './role';

/** "$2,500", or "$12.50" when the amount has cents. */
export function usd(cents: number): string {
  const d = cents / 100;
  return `$${d.toLocaleString('en-US', Number.isInteger(d) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Whole percent of `part` in `whole`, 0 when `whole` is 0. */
export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** "12.50" or "1,200" typed by a person -> cents, or null when it is not a positive amount. */
export function parseCents(text: string): number | null {
  const t = text.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const c = Math.round(parseFloat(t) * 100);
  return c > 0 ? c : null;
}

/** The roles that may use the money pages (the draft schema gives reviewers nothing in Money). */
export function canUseMoney(role: StaffRole): boolean {
  return role === 'admin' || role === 'board';
}

/** Mock mode only: ?as=board|reviewer shows the page as that role, so the hidden controls can be checked. */
export function mockRole(as: string | undefined, real: StaffRole): StaffRole {
  return as === 'admin' || as === 'board' || as === 'reviewer' ? as : real;
}

/** A person on a checklist row: avatar and name. kind "group" is "Board", "none" is "Unassigned". */
export type Who = { kind: 'person'; user_id: string; name: string; initials: string } | { kind: 'group'; name: string } | { kind: 'none' };

/** A step of a checklist ("Year-end giving", "Getting started with grants"): a tasks row with a checklist_id. */
export type WideStep = {
  id: string;
  title: string;
  /** The small line under the title ("Goal", "Next step"). */
  kind: string;
  owner: Who;
  due_on: string | null;
  done: boolean;
  /** The step that is up next: gold row, "Next · Owner". */
  current: boolean;
};

export type WideChecklist = { id: string; title: string; steps: WideStep[] };

/** The text under a checklist title: "1 of 5 done, now Draft the donor letter". */
export function checklistLine(c: WideChecklist): string {
  const done = c.steps.filter((s) => s.done).length;
  const next = c.steps.find((s) => !s.done);
  return next ? `${done} of ${c.steps.length} done, now ${next.title}` : `${done} of ${c.steps.length} done`;
}

/** The gift sources (gifts.source) with their names on the By source panel. */
export const GIFT_SOURCES = [
  { key: 'individual', label: 'Individual donors' },
  { key: 'corporate', label: 'Employer match and corporate' },
  { key: 'event', label: 'Events' },
  { key: 'grant', label: 'Grants' },
] as const;
export type GiftSource = (typeof GIFT_SOURCES)[number]['key'];

// ---------------------------------------------------------------- Budget
export type BudgetCategory = {
  id: string;
  /** budget_categories.name (laptop). */
  name: string;
  /** The shorter name the phone's By category list shows. */
  phone: string;
  /** The shortest name, for the approval screen's lines. */
  short: string;
  budget_cents: number;
  spent_cents: number;
  q4_plan_cents: number;
};

/** spending_entries joined with its category. The frames' placeholder rows have no date, text or amount. */
export type SpendRow = { id: string; spent_on: string | null; description: string; category_id: string | null; category: string; amount_cents: number | null };

export type PlanStatus = 'draft' | 'awaiting_approval' | 'approved' | 'declined';

/** budget_quarter_plans plus what the screens need around it. */
export type PlanState = {
  id: string;
  /** The "Approve Q4 budget" task (tasks.id), the same item as on Today and Tasks. */
  task_id: string;
  year: number;
  quarter: number;
  status: PlanStatus;
  note: string | null;
  decline_note: string | null;
  due_on: string;
  /** Who drafted the plan (submitted_by's name): where a decline note goes back to. */
  submitter: string;
  /** Who approved or declined it and when (stamped by the database: decided_by, decided_at). */
  decided_by: string | null;
  decided_at: string | null;
};

export type BudgetStep = { id: string; title: string; owner: string; due_on: string; done: boolean; now: string; kind: 'step' | 'approval' };
export type Comment = { id: string; name: string; initials: string; time: string; body: string };
export type Fund = { cents: number; as_of: string; by: string };

export type BudgetData = {
  failed: boolean;
  mode: 'mock' | 'live';
  /** The signed-in person's user id (for "Approved by you"). */
  me: string;
  year: number;
  q3_spent_cents: number;
  funds: Fund;
  categories: BudgetCategory[];
  recent: SpendRow[];
  plan: PlanState;
  steps: BudgetStep[];
  comments: { count: number; list: Comment[] };
  chat: { name: string; initials: string; time: string; body: string };
};


// Totals row: 2026 budget, spent so far, Q4 plan.
export function totals(cats: BudgetCategory[]) {
  return cats.reduce((t, c) => ({ budget: t.budget + c.budget_cents, spent: t.spent + c.spent_cents, plan: t.plan + c.q4_plan_cents }), { budget: 0, spent: 0, plan: 0 });
}

// ---------------------------------------------------------------- Fundraising

/** One gift row on Recent gifts (gifts joined with donors). The frames' placeholder rows have nothing filled in. */
export type GiftRow = { id: string; gift_on: string | null; donor: string; source: GiftSource | null; amount_cents: number | null };
/** One line of By source: gifts.source and what it adds up to. */
export type SourceRow = { key: GiftSource; label: string; cents: number };

export type FundraisingData = {
  failed: boolean;
  mode: 'mock' | 'live';
  goal_cents: number;
  raised_cents: number;
  /** What Q3 brought in (the header line). */
  q3_cents: number;
  donors: number;
  /** The average gift, shown as "about $360". */
  avg_gift_cents: number;
  new_donors: number;
  monthly_donors: number;
  sources: SourceRow[];
  recent: GiftRow[];
  checklist: WideChecklist;
};

// ---------------------------------------------------------------- Grants

/** grants as the Grants page lists them. A null funder is the "[Funder]" placeholder. */
export type GrantRow = {
  id: string;
  name: string;
  funder: string | null;
  amount_cents: number | null;
  amount_is_up_to: boolean;
  stage: 'researching' | 'writing' | 'submitted' | 'decided';
  outcome: 'won' | 'declined' | null;
  deadline_on: string | null;
  date_note: string | null;
  submitted_on: string | null;
  owner: Who | null;
};
export const GRANT_STAGES = ['researching', 'writing', 'submitted', 'decided'] as const;
export type GrantStage = (typeof GRANT_STAGES)[number];

export type GrantsData = {
  failed: boolean;
  mode: 'mock' | 'live';
  /** How many real grants there are (the header line: "No grants yet", "1 grant"). */
  count: number;
  /** Grants per stage; can be more than the rows listed (the page shows the first two and "Show all N"). */
  counts: Record<GrantStage, number>;
  grants: GrantRow[];
  checklist: WideChecklist;
};

// ---------------------------------------------------------------- People and roles

/** staff_profiles joined with staff_directory(): a staff member, their role and last sign-in. */
export type PersonRow = {
  user_id: string;
  display_name: string;
  initials: string;
  title: string | null;
  role: StaffRole;
  last_sign_in_at: string | null;
};

export type PeopleData = { failed: boolean; mode: 'mock' | 'live'; me: string; people: PersonRow[]; now: string };
