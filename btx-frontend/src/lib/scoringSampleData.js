// PLACEHOLDER SAMPLE DATA -- Scoring preview page ONLY.
//
// Every value in this file is hand-authored, front-end-only sample data,
// same sibling-module pattern as awardeeWorkflowSampleData.js,
// interviewsSampleData.js, and applicantRecordsSampleData.js (not a Pinia
// store). Nothing on the Scoring page is fetched from Supabase -- there is
// no rubric/score table backing any of this yet.
//
// YOUR_QUEUE and ALL_APPLICANTS below are wrapped in Vue's own reactive()
// rather than being plain arrays -- ScoreApplicant.vue (the per-applicant
// detail page reached from a queue row's "Score ->" button) mutates these
// SAME arrays/objects on Save draft/Publish, and Scoring.vue needs to see
// those mutations live without either page knowing about the other's
// internals. A plain module-level reactive() singleton is enough for that
// -- a full Pinia store would be overkill for a front-end-only preview
// with no persistence and no other consumers.
import { reactive } from 'vue'

// PLACEHOLDER: the signed-in reviewer viewing this page, same caveat as
// Awardee Workflow's own "you" board member (YOU_INITIALS there) -- a real
// build needs this tied to the actual signed-in reviewer's identity, which
// doesn't exist in a usable form for this page yet.
export const VIEWER_INITIALS = 'MJ'

// Your scoring queue -- 5 applicants assigned to this reviewer. `accent`
// drives the row's left border (green once you've scored it, gold while
// it's still waiting on you); `yourScore` is null for the 3 rows that
// haven't been scored yet, which is what makes them render the Score
// button instead of a score badge. `draftSaved` starts false -- flipped
// true by ScoreApplicant.vue's Save draft action, and read by Scoring.vue
// to show a small "Draft saved" indicator on that row.
export const YOUR_QUEUE = reactive([
  {
    id: 'APP-014',
    yourScore: 4.8,
    meta: 'Interviewer #2: reviewer - both complete',
    accent: 'green',
    draftSaved: false,
  },
  {
    id: 'APP-035',
    yourScore: 3.7,
    meta: 'Interviewer #2: board - awaiting board',
    accent: 'green',
    draftSaved: false,
  },
  {
    id: 'APP-058',
    yourScore: null,
    meta: 'Interviewer #2: reviewer - not started',
    accent: 'gold',
    draftSaved: false,
  },
  {
    id: 'APP-062',
    yourScore: null,
    meta: 'Interviewer #2: board - not started',
    accent: 'gold',
    draftSaved: false,
  },
  {
    id: 'APP-066',
    yourScore: null,
    meta: 'Interviewer #2: reviewer - not started',
    accent: 'gold',
    draftSaved: false,
  },
])

// Cycle-wide progress tiles. `tone` picks the tile-value color class --
// 'dark' (the average-score tile) is deliberately NOT gold, so it reads
// visually distinct from the other two.
export const CYCLE_PROGRESS_TILES = [
  { key: 'scored', label: 'Applicants scored', value: '62/70', tone: 'gold' },
  { key: 'average', label: 'Average weighted score', value: '3.9/5', tone: 'dark' },
  { key: 'pending', label: 'Pending score', value: '8', tone: 'rust' },
]

// Rubric criteria, in the exact order they're scored -- weight is out of
// 100% across all six, average is out of 5. Bar fill width is derived from
// `average` at render time (average / 5), not stored separately.
export const RUBRIC_CRITERIA = [
  { key: 'community', label: 'Community Engagement and Values', weight: 20, average: 3.8 },
  { key: 'resilience', label: 'Resilience and Problem-Solving', weight: 20, average: 3.6 },
  { key: 'leadership', label: 'Leadership and Teamwork', weight: 20, average: 4.0 },
  { key: 'financial', label: 'Financial Need and Impact', weight: 20, average: 4.1 },
  { key: 'communication', label: 'Communication Skills', weight: 10, average: 3.9 },
  { key: 'passion', label: 'Passion and Motivation', weight: 10, average: 4.2 },
]

// All applicants this cycle -- a SEPARATE list from YOUR_QUEUE above:
// `combinedScore` is the two-interviewer combined/final score, not this
// reviewer's own personal score (compare APP-014's 4.6 here against 4.8 in
// the queue -- deliberately different numbers, not a typo).
//
// `pill` is stored as its own literal field rather than derived from
// `interviewerText` on purpose: APP-035 shows pill "Scored" despite only
// "1 of 2 interviewers complete", so there's no single clean formula
// ("Scored" once N of 2 complete) that reproduces the verified sample data
// -- storing the literal value is honest about that instead of inventing
// a derivation rule that doesn't actually hold.
export const ALL_APPLICANTS = reactive([
  {
    id: 'APP-003',
    combinedScore: 4.8,
    interviewerText: '2 of 2 interviewers complete',
    pill: 'Scored',
    isYou: false,
  },
  {
    id: 'APP-014',
    combinedScore: 4.6,
    interviewerText: '2 of 2 interviewers complete',
    pill: 'Scored',
    isYou: true,
  },
  {
    id: 'APP-035',
    combinedScore: 3.7,
    interviewerText: '1 of 2 interviewers complete',
    pill: 'Scored',
    isYou: true,
  },
  {
    id: 'APP-022',
    combinedScore: 3.1,
    interviewerText: '2 of 2 interviewers complete',
    pill: 'Scored',
    isYou: false,
  },
  {
    id: 'APP-058',
    combinedScore: null,
    interviewerText: '0 of 2 interviewers complete',
    pill: 'Pending',
    isYou: true,
  },
])
