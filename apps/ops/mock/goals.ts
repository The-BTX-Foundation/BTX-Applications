// Goals page sample data (Figma "Goals" frames, laptop + phone, normal and stress). Types mirror the draft schema:
// `goals` (year, title, metric, status, ...), `year_figures` (year, metric, value). The page only sees lib/goals.ts.
export type GoalStatus = 'in_planning' | 'in_progress' | 'on_track' | 'at_risk' | 'met' | 'missed' | 'not_started';

/** One goal card. `value`/`unit` and `foot` are the laptop wording; `phone*` is the phone wording where it differs. */
export type GoalCard = {
  id: string;
  title: string;
  status: GoalStatus;
  value: string;
  /** The phone frame shows a different number for one goal. */
  phoneValue?: string;
  phoneFrac?: number;
  unit?: string;
  phoneUnit?: string;
  /** 0..1, how full the bar is (capped at 1). */
  frac: number;
  foot: string;
  phoneFoot: string;
};

export type CycleBar = { label: string; phoneLabel: string; sub: string; phoneSub: string; count: number | null };

export type YearFigure = { year: number; metric: 'money_raised_cents' | 'applicants'; value: number };

export type GoalsData = {
  year: number;
  cards: GoalCard[];
  cycles: CycleBar[];
  /** Past years shown in the "Year over year" table (laptop). */
  yoyYears: number[];
  figures: YearFigure[];
};

const CYCLES: CycleBar[] = [
  { label: 'Spring', phoneLabel: 'Sp', sub: '2021', phoneSub: '21', count: 2 },
  { label: 'Fall', phoneLabel: 'Fa', sub: '2021', phoneSub: '21', count: 1 },
  { label: 'Spring', phoneLabel: 'Sp', sub: '2022', phoneSub: '22', count: 1 },
  { label: 'Fall', phoneLabel: 'Fa', sub: '2022', phoneSub: '22', count: 1 },
  { label: 'Fall', phoneLabel: 'Fa', sub: '2023', phoneSub: '23', count: 1 },
  { label: 'Spring', phoneLabel: 'Sp', sub: '2024', phoneSub: '24', count: 5 },
  { label: 'Spring', phoneLabel: 'Sp', sub: '2025', phoneSub: '25', count: 3 },
  // the cycle being decided: a dashed "?" bar
  { label: 'Fall 2026', phoneLabel: 'Fa', sub: 'Oct 23', phoneSub: '26', count: null },
];

export const MOCK_GOALS: GoalsData = {
  year: 2026,
  cards: [
    { id: 'raise', title: 'Raise $15,000', status: 'in_progress', value: '$9,800', phoneUnit: 'raised', frac: 0.65, foot: '65% of the goal. Q4 needs $5,200.', phoneFoot: '65% of the goal. Q4 needs $5,200.' },
    { id: 'budget', title: 'Stay on budget', status: 'on_track', value: '$3,670', unit: 'spent', frac: 0.432, foot: 'of $8,500 for 2026.', phoneFoot: 'of $8,500 for 2026.' },
    { id: 'cert', title: 'Start the certification program', status: 'in_planning', value: '1 of 5', unit: 'steps', frac: 0.2, foot: '4 steps to go.', phoneFoot: 'Planning call Thu Oct 22.' },
    { id: 'award', title: 'Award the Legacy Scholarship', status: 'on_track', value: '10 of 18', unit: 'scored', frac: 0.556, foot: 'Award by Fri Oct 23.', phoneFoot: 'Selection meeting Fri Oct 16.' },
  ],
  cycles: CYCLES,
  yoyYears: [2023, 2024, 2025],
  figures: [],
};

// ?demo=stress: a goal passed, one not started, large counts (Figma "Goals, stress" frames).
export const MOCK_GOALS_STRESS: GoalsData = {
  ...MOCK_GOALS,
  cards: [
    { id: 'raise', title: 'Raise $15,000', status: 'met', value: '$16,250', phoneUnit: 'raised', frac: 1, foot: '108%, goal passed. $1,250 over.', phoneFoot: '108%, goal passed. $1,250 over.' },
    MOCK_GOALS.cards[1],
    { id: 'cert', title: 'Start the certification program', status: 'not_started', value: '0 of 5', unit: 'steps', frac: 0, foot: '5 steps to go.', phoneFoot: 'Planning call Wed Sep 30, 9:30 PM.' },
    { id: 'award', title: 'Award the Legacy Scholarship', status: 'on_track', value: '14 of 120', unit: 'scored', frac: 14 / 120, foot: 'Award by Fri Oct 23.', phoneFoot: 'Selection meeting Fri Oct 16.' },
  ],
};
