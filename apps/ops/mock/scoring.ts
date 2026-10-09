// MOCK: scoring and interview details for each applicant, looked up by applicant code. The schema has no scores, no
// interviewers and no reviewer stages yet (those tables come with the Ops Hub schema), so this module stands in for them.
// The sample values are the Figma "Scholarships > Applicants" frames' (a Sunday, Oct 4). In live mode a code with no
// fixture here gets a plain default row, so real applicants are never shown made-up scores.
import { dayLabel } from '@/lib/format';

export type Stage = {
  kind: 'needs-score' | 'waiting' | 'interview' | 'scored' | 'none';
  label: string;
};

export type ScoreCell =
  | { kind: 'draft'; line1: string; line2: string }
  | { kind: 'none'; line1: string }
  | { kind: 'avg'; line1: string; line2?: string };

export type ProgressStep = { label: string; state: 'done' | 'now' | 'next'; note?: string };

export type Scoring = {
  group: 'attention' | 'scored';
  /** Interviewer initials in order ("DM", "CG"). */
  interviewers: string[];
  score: ScoreCell;
  stage: Stage;
  /** The interview summary text, or null when there is none yet. */
  summary: string | null;
  progress: ProgressStep[];
  /** The primary action in the detail panel. */
  action: string;
};

/** The people who interview, by initials. Only the names the Figma frames spell out are listed. */
export const BOARD_NAMES: Record<string, string> = {
  DM: 'Dania Morris',
  CG: 'Chariah Ghee',
  MD: 'Marcus Davis',
  KD: 'Kelsey Davis',
  TF: 'Tomi F.',
  CK: 'C. K.',
  DS: 'D. S.',
};

const SELECTION = 'Fri Oct 16';
const AWARD = 'Fri Oct 23';

// The standard five-step progress for an application at a given point.
function steps(at: 'interview' | 'scoring' | 'selection', note?: string, interviewDay?: string): ProgressStep[] {
  const state = (i: number, now: number): ProgressStep['state'] => (i < now ? 'done' : i === now ? 'now' : 'next');
  const now = at === 'interview' ? 1 : at === 'scoring' ? 2 : 3;
  return [
    { label: 'Applied', state: state(0, now) },
    { label: 'Interviewed', state: state(1, now), note: at === 'interview' && interviewDay ? interviewDay : undefined },
    { label: at === 'scoring' ? 'Scored, now' : 'Scored', state: state(2, now), note: at === 'scoring' ? note : undefined },
    { label: 'Selection meeting', state: state(3, now), note: SELECTION },
    { label: 'Award', state: state(4, now), note: AWARD },
  ];
}

const SUMMARY_00011 =
  'Tutors on campus twice a week and volunteers in a STEM outreach program at home. Nearly withdrew from a lab course while working nights, then rebuilt the schedule with an advisor.';

// A scored row's score cell.
const avg = (v: string): ScoreCell => ({ kind: 'avg', line1: v });
const scored = (interviewers: string[], v: string): Scoring => ({
  group: 'scored',
  interviewers,
  score: avg(v),
  stage: { kind: 'scored', label: 'Scored' },
  summary: null,
  progress: steps('selection'),
  action: 'Open scores',
});

const FIXTURES: Record<string, Scoring> = {
  'APP-2026-00011': {
    group: 'attention',
    interviewers: ['DM', 'CG'],
    score: { kind: 'draft', line1: 'Your draft', line2: '4 of 6' },
    stage: { kind: 'needs-score', label: 'Needs your score' },
    summary: SUMMARY_00011,
    progress: steps('scoring', '1 of 2 published: Chariah published, your draft 4 of 6'),
    action: 'Continue scoring',
  },
  'APP-2026-00012': {
    group: 'attention',
    interviewers: ['DM', 'CG'],
    score: { kind: 'none', line1: 'Not started' },
    stage: { kind: 'needs-score', label: 'Needs your score' },
    summary: null,
    progress: steps('scoring', '0 of 2 published'),
    action: 'Start scoring',
  },
  'APP-2026-00013': {
    group: 'attention',
    interviewers: ['DM', 'CG'],
    score: { kind: 'none', line1: 'Not started' },
    stage: { kind: 'needs-score', label: 'Needs your score' },
    summary: null,
    progress: steps('scoring', '0 of 2 published'),
    action: 'Start scoring',
  },
  'APP-2026-00004': {
    group: 'attention',
    interviewers: ['DM', 'MD'],
    score: { kind: 'avg', line1: '3.7', line2: '1 of 2' },
    stage: { kind: 'waiting', label: 'Waiting on Marcus Davis' },
    summary: null,
    progress: steps('scoring', '1 of 2 published: you published, Marcus has not'),
    action: 'Open scores',
  },
  'APP-2026-00015': {
    group: 'attention',
    interviewers: ['KD', 'TF'],
    score: { kind: 'none', line1: '' },
    stage: { kind: 'interview', label: 'Interview tomorrow' },
    summary: null,
    progress: steps('interview', undefined, 'Mon Oct 5'),
    action: 'Open application',
  },
  'APP-2026-00016': {
    group: 'attention',
    interviewers: ['CK', 'DS'],
    score: { kind: 'none', line1: '' },
    stage: { kind: 'interview', label: 'Interview Tue' },
    summary: null,
    progress: steps('interview', undefined, 'Tue Oct 6'),
    action: 'Open application',
  },
  'APP-2026-00017': {
    group: 'attention',
    interviewers: ['DM', 'CG'],
    score: { kind: 'none', line1: '' },
    stage: { kind: 'interview', label: 'Interview Wed' },
    summary: null,
    progress: steps('interview', undefined, 'Wed Oct 7'),
    action: 'Open application',
  },
  'APP-2026-00018': {
    group: 'attention',
    interviewers: ['MD', 'KD'],
    score: { kind: 'none', line1: '' },
    stage: { kind: 'interview', label: 'Interview Thu' },
    summary: null,
    progress: steps('interview', undefined, 'Thu Oct 8'),
    action: 'Open application',
  },
  'APP-2026-00003': scored(['DM', 'CG'], '4.8'),
  'APP-2026-00014': scored(['KD', 'TF'], '4.6'),
  'APP-2026-00002': scored(['CK', 'DS'], '4.5'),
  'APP-2026-00009': scored(['TF', 'DS'], '4.4'),
  'APP-2026-00001': scored(['DM', 'CG'], '4.3'),
  'APP-2026-00005': scored(['MD', 'KD'], '4.2'),
  'APP-2026-00006': scored(['CK', 'DS'], '4.1'),
  'APP-2026-00007': scored(['KD', 'TF'], '4.0'),
  'APP-2026-00008': scored(['DM', 'MD'], '3.9'),
  'APP-2026-00010': scored(['CG', 'TF'], '3.8'),
};

// The scoring details for a code. A code with no fixture (a real applicant in live mode) gets a plain default: no
// scores, no interviewers, and an interview line only if it has a booking.
export function scoringFor(code: string, real?: { interviewAt?: string }): Scoring {
  const f = FIXTURES[code];
  if (f) return f;
  const at = real?.interviewAt;
  return {
    group: 'attention',
    interviewers: [],
    score: { kind: 'none', line1: '' },
    stage: at ? { kind: 'interview', label: `Interview ${dayLabel(at).split(' ')[0]}` } : { kind: 'none', label: 'Interview not booked' },
    summary: null,
    progress: steps('interview', undefined, at ? dayLabel(at) : undefined),
    action: 'Open application',
  };
}
