// The Goals page's data in the shape the refreshed page draws (Ops Hub refresh, 2026-11-11).
// Reference design: BTX Foundation/apps/design/ops-refresh/directions/p-goals/index.html (the demo, source of truth for
// look and behaviour) and apps/design/ops-refresh/OPS-DNA.md (the finish rules).
//
// This file is the contract between the page (components/goals/*) and the loaders (mock/goals-view.ts in mock mode,
// lib/goals-live.ts in live mode, picked by lib/goals-view-loader.ts). Types only, no logic. Dates travel as ISO strings;
// money travels in cents.
import type { GoalStatus, YearFigure } from '@/mock/goals';

export type { GoalStatus, YearFigure };

/** How a goal is drawn: a money bar with today's mark, step boxes, or one mark per applicant (a slim bar past 40). */
export type GoalKind = 'money' | 'steps' | 'marks';

/** One goal row under "<year> goals". */
export type GoalRow = {
  id: string;
  title: string;
  status: GoalStatus;
  /** The bare line icon at the start of the row (the goal's area). */
  icon: 'money' | 'flag' | 'cap' | 'goals';
  /** True for the money still to raise (the page's news): its icon is gold-ink. */
  lead: boolean;
  kind: GoalKind;
  /** Money goals: cents so far and the target in cents. Other goals: counts. `of` 0 = no target or no steps yet. */
  have: number;
  of: number;
  /** Money goals: the verb ("raised", "spent"). Other goals: the words under the number ("steps done", "applicants scored"). */
  unit: string;
  /** The line beside the status ("Planning call Thu Nov 19, 7:00 PM"), or null. */
  note: string | null;
  /**
   * True when the read behind this goal's count failed (steps or scores): the row shows "Couldn't count" with the page's
   * error line instead of a number, so a failed read never reads as zero.
   */
  uncounted?: boolean;
};

/** One bar under "Scholars funded, by award cycle". `count` null = the cycle still being decided (the dashed "?" bar). */
export type CycleRow = {
  /** "Spring 2021". */
  label: string;
  count: number | null;
  /** Under the dashed bar: "Decided Mon Nov 30"; null otherwise. */
  note: string | null;
};

/** Year over year metrics (the `year_figures.metric` values the page shows). */
export type FigureMetric = YearFigure['metric'];

/**
 * What each control may do. Mock mode: all true (the page changes its own state, like the demo). Live mode: true only where
 * a real write exists behind the control; a false flag means the control is NOT drawn (no dead controls).
 */
export type GoalsCaps = {
  /** "+ Add" a past year's figure and Save it (year_figures upsert). */
  figure: boolean;
  /** "Undo" after a saved figure (the reverse write). */
  figureUndo: boolean;
};

/** Everything the Goals page draws. */
export type GoalsView = {
  /** Eastern-time calendar day the data was built for ("2026-11-10"). */
  today: string;
  /** The year the goals belong to (the current year). */
  year: number;
  /** Years the picker lists, newest first. One year = no picker. */
  years: number[];
  /** This year's goals, in the board's order. Other years in the picker have none. */
  goals: GoalRow[];
  cycles: CycleRow[];
  /** Past years in "Year over year", oldest first. */
  yoyYears: number[];
  /** Past years' figures (money in cents). */
  figures: YearFigure[];
  /** The figure box open when the page opens ("money_raised_cents:2025"), or null. */
  openFigure: string | null;
  /** True when the page's data could not be read: the header and the "Check your connection" card with Try again. */
  loadFailed: boolean;
  caps: GoalsCaps;
};

/** What the loader returns: the view, or a whole-page failure (the shared LoadError card, `?demo=failed`). */
export type GoalsResultV2 = (GoalsView & { failed: false }) | { failed: true };
