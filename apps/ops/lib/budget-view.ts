// The Budget page's data in the shape the refreshed page draws (Ops Hub refresh, 2026-11-12). Both routes use it:
// /finance/budget (the board) and /finance/budget/approval (the plan alone, phone-first).
// Reference design: BTX Foundation/apps/design/ops-refresh/directions/p-budget/index.html (the demo, source of truth for look
// and behaviour; the approval page is the demo's "#/approval" view).
//
// This file is the contract between the page (components/budget/*) and the loaders (mock/budget-view.ts in mock mode,
// lib/budget-live.ts in live mode, picked by lib/budget-view-loader.ts). Types only, no logic. Days travel as "YYYY-MM-DD",
// instants as ISO strings, money in cents.

/** Who a step belongs to: a person (with their initials), a group ("Board"), or nobody yet. */
export type BuWho = { kind: 'person'; name: string; initials: string; me: boolean } | { kind: 'group'; name: string } | { kind: 'none' };

/** A person who wrote something (a comment, a chat message). */
export type BuAuthor = { name: string; initials: string; me: boolean };

/** The plan as the page draws it: none (no plan or still a draft), waiting (for approval), approved, declined (sent back). */
export type BuPlanStatus = 'none' | 'waiting' | 'approved' | 'declined';

/** One budget category of the year (budget_category_totals). */
export type BuCategory = {
  id: string;
  /** "Sponsorships" (the part of budget_categories.name before any brackets). */
  name: string;
  /** "NSBE convention" (the bracketed part), or null. */
  sub: string | null;
  budgetCents: number;
  /** Everything spent in the year, the plan's quarter included. */
  spentCents: number;
  /** What was spent in the plan's quarter (it uses up that quarter's plan). */
  quarterSpentCents: number;
  /** The plan's amount for this category (budget_quarter_plan_lines via the totals view). */
  planCents: number;
  /** The "New line" tag on the plan. Live mode has no column for it (always false); the mock sample sets it. */
  isNew: boolean;
};

/** One step of the plan's checklist (tasks with checklists.budget_plan_id); the approval step is the task of type "approval". */
export type BuStep = {
  id: string;
  title: string;
  who: BuWho;
  /** Due day, or null. */
  due: string | null;
  done: boolean;
  /** The day it was done (completed_at, Eastern), or null when unknown (the page then uses the due day). */
  doneOn: string | null;
  approval: boolean;
};

/** A comment on the approval task (task_comments). `at` null = just now (a mock comment). */
export type BuComment = { id: string; by: BuAuthor; at: string | null; body: string };

/** One spending row of the plan's quarter (spending_entries). */
export type BuSpend = { id: string; on: string; categoryId: string | null; category: string; title: string; cents: number };

/** The newest funds-on-hand snapshot (funds_snapshots), or null when none was recorded. */
export type BuFunds = { cents: number; asOf: string; by: BuAuthor | null } | null;

/** A Finance chat message (the area channel "money"; never a direct message). `at` null = just now (a mock send). */
export type BuMsg = { id: string; by: BuAuthor; at: string | null; body: string };

/** The plan (budget_quarter_plans) plus what the screens need around it. */
export type BuPlan = {
  /** '' when there is no plan row yet. */
  id: string;
  /** The approval task (tasks.id), the same item as Today's and Tasks' "Approve the Q4 budget"; '' when none. */
  taskId: string;
  quarter: number;
  status: BuPlanStatus;
  /** The approval step's due day, or null. */
  due: string | null;
  /** Who drafted it (submitted_by, else the drafting step's owner): where a decline goes back to. Null = nobody yet. */
  from: { name: string; first: string } | null;
  /** The note the plan was declined with (live mode shows it read-only). */
  declineNote: string | null;
  /** Who approved or declined it and when (decided_by, decided_at), or null. */
  decidedBy: { name: string; me: boolean } | null;
  decidedAt: string | null;
};

/**
 * What each control may do. Mock mode: all true (the demo's whole flow, kept in the tab's memory). Live mode: money writes
 * stay off (owner decision 2026-10-12, SPEC-PAGE-BUILD-2 rule 3a): approve, decline, undo, log spending and update funds draw
 * a disabled "Coming soon" control; comment, chat and nudge have no backed write on this page and are not drawn.
 */
export type BudgetCaps = {
  /** Approve the plan (plan -> approved, then the approval task -> done). */
  approve: boolean;
  /** Decline with a note (plan -> declined, back to the drafter). */
  decline: boolean;
  /** Undo an approval or decline (rpc undo_budget_decision). */
  undo: boolean;
  /** Log spending (spending_entries insert). */
  logSpend: boolean;
  /** Update funds on hand (funds_snapshots insert). */
  funds: boolean;
  /** Reply in the plan's comments. Mock only. */
  comment: boolean;
  /** Reply in the Finance chat from this page. Mock only (the real chat is one link away). */
  chat: boolean;
  /** "Nudge <drafter>" when there is no plan yet. Mock only. */
  nudge: boolean;
};

/** Everything both Budget routes draw. */
export type BudgetView = {
  /** Eastern calendar day the data was built for ("2026-11-10"). */
  today: string;
  year: number;
  cats: BuCategory[];
  /** Category ids in the order the plan's lines list them (live mode: biggest plan amount first). */
  lineOrder: string[];
  plan: BuPlan;
  steps: BuStep[];
  /** All comments read (count = list length in live mode; the mock stress sample has a bigger count than list). */
  comments: { count: number; list: BuComment[] };
  /** Spending rows of the plan's quarter, newest first (live mode: only the five the page draws). */
  spend: BuSpend[];
  /** Every spending row of the plan's quarter: how many and their sum (live mode reads them all; the page gets only five). */
  spendAll: { count: number; cents: number };
  /** What the quarter before the plan's closed at ("Q3 closed at $460"). */
  prevQuarterCents: number;
  funds: BuFunds;
  /** The Finance chat's newest message(s); `failed` = that read failed (only the chat panel shows its error line). */
  chat: { failed: boolean; messages: BuMsg[] };
  /** True when a core read failed: the header and the "Budget didn't load." card with Try again. */
  loadFailed: boolean;
  caps: BudgetCaps;
};

/**
 * What the loader returns: the view; a whole-page failure (the shared LoadError card, mock `?demo=failed`); or, for
 * /finance/budget/approval?plan=<id>, a plan that does not exist or is not visible ("That plan isn't available.", mock
 * `?demo=unavailable`).
 */
export type BudgetResult = (BudgetView & { failed: false }) | { failed: true; unavailable?: boolean };
