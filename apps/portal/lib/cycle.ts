// The cycle as the Portal screens use it: a flat "view" with every setting already formatted, or its bracketed
// placeholder when the setting is empty (the signed-off frames show [amount], [time], [date] until the board fills
// them in). In mock mode (no Supabase env) the view is the Fall 2026 example from the drafts, and `?preview=` picks
// which landing to draw. In live mode the view comes from the published cycle row.
import { createAnonClient } from '@btx/data/server';
import { cycleVariant, fetchPublishedCycle, getPublishedCycle, getAuthMode, type Cycle, type CycleVariant } from '@btx/data';
import { PLACEHOLDER, daysBetween, easternDate, easternTime, formatMoney, longDay, shortDay } from './format';

export type CycleView = {
  /** The cycle row's id, or null with no published cycle (and in mock mode). */
  id: string | null;
  term: string | null;
  awardName: string | null;
  amount: string;
  /** "Mon Aug 17" */
  opensLong: string;
  /** "Mon Sep 14" */
  applyByLong: string;
  /** "11:59 PM", or "[time]" */
  deadlineTime: string;
  /** "Oct" style month for the closed landing, or "[month]". */
  nextMonth: string;
  requirements: string[];
  /** The essay prompt and how the essay is used, or null when not set. */
  essayPrompt: string | null;
  essayUse: string | null;
  /** "30 minutes", or "[time]" */
  codeLifetime: string;
  /** Inputs for the dates drawing (all "YYYY-MM-DD"), or null when the dates are not all set. */
  drawing: null | {
    opens: string;
    apply: string;
    interviewStart: string;
    interviewEnd: string;
    decision: string;
    today: string;
  };
};

export type Landing = { variant: CycleVariant; view: CycleView };

// The example cycle from the drafts (today is Sat Sep 12, two days before the deadline).
const MOCK: CycleView = {
  id: null,
  term: 'Fall 2026',
  awardName: 'Legacy Scholarship',
  amount: PLACEHOLDER.amount,
  opensLong: 'Mon Aug 17',
  applyByLong: 'Mon Sep 14',
  deadlineTime: PLACEHOLDER.time,
  nextMonth: 'October',
  requirements: [],
  essayPrompt: null,
  essayUse: null,
  codeLifetime: PLACEHOLDER.time,
  drawing: {
    opens: '2026-08-17',
    apply: '2026-09-14',
    interviewStart: '2026-09-15',
    interviewEnd: '2026-10-09',
    decision: '2026-10-23',
    today: '2026-09-12',
  },
};

// Turns a cycle row into the view.
export function toView(c: Cycle): CycleView {
  const opens = c.opens_at ? easternDate(c.opens_at) : null;
  const apply = c.closes_at ? easternDate(c.closes_at) : null;
  const complete = opens && apply && c.interview_start && c.interview_end && c.decision_date;
  return {
    id: c.id,
    term: c.term,
    awardName: c.award_name,
    amount: formatMoney(c.award_amount_cents),
    opensLong: longDay(opens),
    applyByLong: longDay(apply),
    deadlineTime: easternTime(c.closes_at),
    nextMonth: c.next_cycle_month ?? PLACEHOLDER.month,
    essayPrompt: c.essay_prompt,
    essayUse: c.essay_use,
    requirements: Array.isArray(c.requirements) ? c.requirements.filter((r): r is string => typeof r === 'string') : [],
    codeLifetime: c.code_lifetime_minutes ? `${c.code_lifetime_minutes} minutes` : PLACEHOLDER.time,
    drawing: complete
      ? {
          opens,
          apply,
          interviewStart: c.interview_start!,
          interviewEnd: c.interview_end!,
          decision: c.decision_date!,
          today: easternDate(new Date()),
        }
      : null,
  };
}

// Loads which landing to show and the cycle's settings. `preview` only works in mock mode.
export async function loadLanding(preview?: string): Promise<Landing | { failed: true }> {
  if (getAuthMode() === 'mock') {
    if (preview === 'error') return { failed: true };
    const variant: CycleVariant = preview === 'soon' ? 'before-open' : preview === 'closed' ? 'closed' : 'open';
    const view =
      variant === 'before-open'
        ? { ...MOCK, drawing: { ...MOCK.drawing!, today: '2026-08-03' } }
        : MOCK;
    return { variant, view };
  }
  const { cycle, failed } = await fetchPublishedCycle(createAnonClient());
  if (failed) return { failed: true };
  return {
    variant: cycleVariant(cycle),
    view: cycle ? toView(cycle) : { ...MOCK, id: null, term: null, awardName: null, amount: PLACEHOLDER.amount, opensLong: PLACEHOLDER.date, applyByLong: PLACEHOLDER.date, nextMonth: PLACEHOLDER.month, drawing: null },
  };
}

// Props for the dates drawing from the view, or undefined to draw the example proportions with [date] labels.
export function drawingProps(view: CycleView, mode: 'open' | 'before') {
  const d = view.drawing;
  if (!d) return { mode, dates: { opens: PLACEHOLDER.date, apply: PLACEHOLDER.date, interview: PLACEHOLDER.date, decision: PLACEHOLDER.date }, applyLabel: `Apply by ${PLACEHOLDER.date}`, todayLabel: 'Today' };
  const total = daysBetween(d.opens, d.decision);
  const today = daysBetween(d.opens, d.today);
  const left = daysBetween(d.today, d.apply);
  return {
    mode,
    days: {
      apply: daysBetween(d.opens, d.apply),
      interviewStart: daysBetween(d.opens, d.interviewStart),
      interviewEnd: daysBetween(d.opens, d.interviewEnd),
      decision: total,
      today,
    },
    todayLabel: left <= 0 ? 'Today: last day' : left === 1 ? 'Today: 1 day left' : `Today: ${left} days left`,
    dates: {
      opens: shortDay(d.opens),
      apply: shortDay(d.apply),
      interview: `${shortDay(d.interviewStart)} to ${shortDay(d.interviewEnd)}`,
      decision: shortDay(d.decision),
    },
    applyLabel: `Apply by ${shortDay(d.apply)}`,
  };
}

// How long a sign-in code works, as text for the expired screen and in minutes (60 when the cycle does not say).
export async function loadCodeLifetime(): Promise<{ text: string; minutes: number }> {
  if (getAuthMode() === 'mock') return { text: PLACEHOLDER.time, minutes: 60 };
  const cycle = await getPublishedCycle(createAnonClient());
  const minutes = cycle?.code_lifetime_minutes ?? null;
  return { text: minutes ? `${minutes} minutes` : PLACEHOLDER.time, minutes: minutes ?? 60 };
}

// The example cycle used by the mock mode.
export const MOCK_VIEW = MOCK;
