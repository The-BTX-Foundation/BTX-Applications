// Goals sample data for mock mode, in the refreshed page's shape (lib/goals-view.ts). The same data as the signed-off demo
// (apps/design/ops-refresh/directions/p-goals/index.html): the sample day is Tue Nov 10, 2026; normal, stress and empty.
import type { CycleRow, GoalRow, GoalsView } from '@/lib/goals-view';

const GOALS: GoalRow[] = [
  { id: 'raise', title: 'Raise $15,000', status: 'in_progress', icon: 'money', lead: true, kind: 'money', have: 980_000, of: 1_500_000, unit: 'raised', note: null },
  { id: 'budget', title: 'Stay on budget', status: 'on_track', icon: 'money', lead: false, kind: 'money', have: 367_000, of: 850_000, unit: 'spent', note: null },
  { id: 'cert', title: 'Start the certification program', status: 'in_planning', icon: 'flag', lead: false, kind: 'steps', have: 1, of: 5, unit: 'steps done', note: 'Planning call Thu Nov 19, 7:00 PM' },
  { id: 'award', title: 'Award the Legacy Scholarship', status: 'on_track', icon: 'cap', lead: false, kind: 'marks', have: 0, of: 21, unit: 'applicants scored', note: 'Selection Tue Nov 24 · award in 20 days' },
];

const CYCLES: CycleRow[] = [
  { label: 'Spring 2021', count: 2, note: null },
  { label: 'Fall 2021', count: 1, note: null },
  { label: 'Spring 2022', count: 1, note: null },
  { label: 'Fall 2022', count: 1, note: null },
  { label: 'Fall 2023', count: 1, note: null },
  { label: 'Spring 2024', count: 5, note: null },
  { label: 'Spring 2025', count: 3, note: null },
  // the cycle being decided: the dashed "?" bar
  { label: 'Fall 2026', count: null, note: 'Decided Mon Nov 30' },
];

/** The normal sample: money still to raise, nothing typed in for past years yet, the 2025 money box open. */
export const GOALS_VIEW: GoalsView = {
  today: '2026-11-10',
  year: 2026,
  years: [2026, 2025, 2024],
  goals: GOALS,
  cycles: CYCLES,
  yoyYears: [2023, 2024, 2025],
  figures: [],
  openFigure: 'money_raised_cents:2025',
  loadFailed: false,
  caps: { figure: true, figureUndo: true },
};

/** ?demo=stress: the money goal passed, one goal not started, 120 applicants, a seven-figure past year. */
export const GOALS_VIEW_STRESS: GoalsView = {
  ...GOALS_VIEW,
  goals: [
    { ...GOALS[0], status: 'met', have: 1_625_000 },
    GOALS[1],
    { ...GOALS[2], status: 'not_started', have: 0 },
    { ...GOALS[3], have: 14, of: 120 },
  ],
  figures: [
    { year: 2023, metric: 'money_raised_cents', value: 124_850_000 },
    { year: 2023, metric: 'applicants', value: 96 },
    { year: 2024, metric: 'applicants', value: 104 },
  ],
  openFigure: 'money_raised_cents:2024',
};

/** ?demo=empty: no goals set, no scholarships awarded yet, no past figures. */
export const GOALS_VIEW_EMPTY: GoalsView = {
  ...GOALS_VIEW,
  goals: [],
  cycles: [],
};
