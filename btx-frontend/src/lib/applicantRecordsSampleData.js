// PLACEHOLDER SAMPLE DATA -- Applicant Records preview page ONLY.
//
// Every value in this file is hand-authored, front-end-only sample data,
// same sibling-module pattern as awardeeWorkflowSampleData.js and
// interviewsSampleData.js (not a Pinia store). Nothing on the Applicant
// Records page is fetched from Supabase -- there is no closed-cycle
// applicant table backing any of this yet.
//
// `name` on each record exists ONLY so the search box has something
// honest to match against -- it is never rendered anywhere on screen,
// matching the mockup's own display (which shows ID/cycle/score/status,
// never a name).
export const APPLICANT_RECORDS = [
  { id: 'APP-2025-011', name: 'Jordan Diaz', cycleYear: 2025, finalScore: 94, status: 'Awarded' },
  { id: 'APP-2025-004', name: 'Maria Chen', cycleYear: 2025, finalScore: 90, status: 'Awarded' },
  { id: 'APP-2025-029', name: 'Samuel Okafor', cycleYear: 2025, finalScore: 82, status: 'Waitlisted' },
  { id: 'APP-2025-033', name: 'Priya Patel', cycleYear: 2025, finalScore: 58, status: 'Declined' },
  { id: 'APP-2024-018', name: 'Elena Rossi', cycleYear: 2024, finalScore: 97, status: 'Awarded' },
]

// Cycle filter pills, in display order (newest first) -- 2023/2022 have no
// matching sample rows above, which is deliberate: selecting either shows
// the list's own empty state rather than a broken-looking blank gap.
export const CYCLE_FILTERS = [2025, 2024, 2023, 2022]

// All-time totals -- fixed regardless of the cycle filter or search text,
// since they're summary stats about the whole historical record, not a
// count of whatever's currently visible in the list below.
export const SUMMARY_TILES = [
  { key: 'total', label: 'Total historical applicants', value: '312' },
  { key: 'awarded', label: 'Awarded all-time', value: '13' },
  { key: 'rate', label: 'Award rate', value: '4.2%' },
]
