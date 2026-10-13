// MOCK: the rubric, the signed-in scorer's scores and the interview notes, shaped like the draft Ops Hub tables
// `rubric_criteria` (key, name, weight, position), `scores` (criteria jsonb, published), `interview_summaries`
// (summary, quotes jsonb) and `score_private_notes`. None of these tables exist yet (draft on branch db/ops-schema).
// Applicants are keyed by applicant code. The sample is Dania Morris's queue in the Figma "Scholarships > Scoring" frame.
export type RubricCriterion = { key: string; name: string; weight: number; position: number };

export const RUBRIC: RubricCriterion[] = [
  { key: 'community', name: 'Community engagement and values', weight: 20, position: 1 },
  { key: 'resilience', name: 'Resilience and problem-solving', weight: 20, position: 2 },
  { key: 'leadership', name: 'Leadership and teamwork', weight: 20, position: 3 },
  { key: 'financial', name: 'Financial need and impact', weight: 20, position: 4 },
  { key: 'communication', name: 'Communication skills', weight: 10, position: 5 },
  { key: 'passion', name: 'Passion and motivation', weight: 10, position: 6 },
];

/** Cycle average per criterion. The draft schema has no table for it (it is an average over everyone's published scores). */
export const CYCLE_AVERAGE: Record<string, number> = { community: 3.8, resilience: 3.6, leadership: 4.0, financial: 4.1, communication: 3.9, passion: 4.2 };

export const PICK_LABELS = ['Not evident', 'Emerging', 'Solid', 'Strong', 'Exceptional'] as const;

export type Quote = { criterion: string; at: string; text: string };

export type MockSheet = {
  code: string;
  /** The other interviewer's user id (the signed-in person is the first). */
  otherId: string;
  otherPublished: boolean;
  /** The signed-in person's picks so far: criterion key -> 1..5. */
  criteria: Record<string, number>;
  published: boolean;
  /** "9:14 AM" when a draft exists. */
  draftSavedAt: string | null;
  summary: string | null;
  quotes: Quote[];
  privateNote: string;
};

const SUMMARY_00011 =
  'Tutors on campus twice a week and volunteers with a STEM outreach program at home. Nearly withdrew from a lab course while working nights, then rebuilt the schedule with an advisor. Led a capstone team through a redesign after the first sensor design failed testing. The award would let them cut work hours to take an unpaid research assistantship.';

const QUOTES_00011: Quote[] = [
  { criterion: 'Community', at: '8:12', text: '"I only got interested in engineering because someone made time to explain it to me, so I try to be that person for someone else now."' },
  { criterion: 'Resilience', at: '13:34', text: '"I went to my advisor instead of just quietly failing, and we restructured my schedule around my shifts."' },
];

const FIXTURES: Record<string, MockSheet> = {
  'APP-2026-00011': {
    code: 'APP-2026-00011',
    otherId: 'mock-staff-cg',
    otherPublished: true,
    criteria: { community: 4, resilience: 5, leadership: 4, communication: 4 },
    published: false,
    draftSavedAt: '9:14 AM',
    summary: SUMMARY_00011,
    quotes: QUOTES_00011,
    privateNote: '',
  },
  'APP-2026-00012': { code: 'APP-2026-00012', otherId: 'mock-staff-cg', otherPublished: true, criteria: {}, published: false, draftSavedAt: null, summary: null, quotes: [], privateNote: '' },
  'APP-2026-00013': { code: 'APP-2026-00013', otherId: 'mock-staff-cg', otherPublished: false, criteria: {}, published: false, draftSavedAt: null, summary: null, quotes: [], privateNote: '' },
  'APP-2026-00004': {
    code: 'APP-2026-00004',
    otherId: 'mock-staff-md',
    otherPublished: false,
    criteria: { community: 4, resilience: 4, leadership: 4, financial: 3, communication: 4, passion: 3 },
    published: true,
    draftSavedAt: null,
    summary: null,
    quotes: [],
    privateNote: '',
  },
};

/** The sheet fixture for an applicant code, or null (a code with no fixture starts as "Not started"). */
export function sheetFixture(code: string): MockSheet | null {
  return FIXTURES[code] ?? null;
}

/** The codes in the signed-in person's queue, in order (Dania Morris's four in the Figma frame). */
export const QUEUE_CODES = ['APP-2026-00011', 'APP-2026-00012', 'APP-2026-00013', 'APP-2026-00004'];

/** Weighted score over the picked criteria, rounded to 2 places: the same rule as the draft schema's scores_check(). */
export function weighted(criteria: Record<string, number>): number | null {
  let sum = 0;
  let w = 0;
  for (const c of RUBRIC) {
    const v = criteria[c.key];
    if (v) {
      sum += c.weight * v;
      w += c.weight;
    }
  }
  return w > 0 ? Math.round((sum / w) * 100) / 100 : null;
}
