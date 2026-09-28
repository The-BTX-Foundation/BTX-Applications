// PLACEHOLDER SAMPLE DATA -- Awardee Workflow preview page ONLY.
//
// Every value in this file is hand-authored, front-end-only sample data.
// Nothing on the Awardee Workflow page is fetched from Supabase -- there is
// no applicant/committee-review/decision table backing any of this yet.
// This is a deliberately isolated, non-reactive plain module (not a Pinia
// store) so it can be deleted wholesale and replaced with real fetched data
// later without anything else in the app depending on its shape.
//
// PLACEHOLDER: "TL" is hardcoded below as the signed-in board member for
// this preview (the "you" ring on the vote chips, and the one row of vote
// buttons that's actually clickable). A real build needs this tied to the
// actual signed-in board member's identity -- e.g. useAuthStore's session
// plus a profiles.name/initials lookup -- which doesn't exist in a usable
// form for this page yet.
export const YOU_INITIALS = 'TL'

// The five-member committee roster, in the fixed order every vote-chip
// track renders them.
export const BOARD_MEMBER_INITIALS = ['MR', 'KS', 'DP', 'TL', 'AO']

export const CYCLE_YEARS = [2026, 2025, 2024]
export const DEFAULT_CYCLE_YEAR = 2026

// Pipeline funnel steps per cycle, in order. `status` is 'done' | 'active'
// | 'future' -- explicit per step (not derived from index) so a fully
// closed past cycle (2025/2024) can mark every step 'done' with no
// 'active' stage at all, which an index-based derivation would need a
// special case for anyway.
export const FUNNEL_BY_CYCLE = {
  2026: [
    { key: 'started', label: 'Application started', count: 70, status: 'done' },
    { key: 'completed', label: 'Application completed', count: 65, status: 'done' },
    { key: 'interviewed', label: 'Interviewed', count: 24, status: 'done' },
    { key: 'scored', label: 'Scored', count: 24, status: 'done' },
    { key: 'committee', label: 'Committee review', count: 17, status: 'active' },
    { key: 'awarded', label: 'Awarded', count: 13, status: 'future' },
  ],
  // 2025/2024: smaller, clearly-different, and fully closed -- every step
  // reads 'done' (green) since the cycle has already run its course, with
  // no 'active' stage.
  2025: [
    { key: 'started', label: 'Application started', count: 58, status: 'done' },
    { key: 'completed', label: 'Application completed', count: 52, status: 'done' },
    { key: 'interviewed', label: 'Interviewed', count: 21, status: 'done' },
    { key: 'scored', label: 'Scored', count: 21, status: 'done' },
    { key: 'committee', label: 'Committee review', count: 19, status: 'done' },
    { key: 'awarded', label: 'Awarded', count: 11, status: 'done' },
  ],
  2024: [
    { key: 'started', label: 'Application started', count: 49, status: 'done' },
    { key: 'completed', label: 'Application completed', count: 45, status: 'done' },
    { key: 'interviewed', label: 'Interviewed', count: 17, status: 'done' },
    { key: 'scored', label: 'Scored', count: 17, status: 'done' },
    { key: 'committee', label: 'Committee review', count: 15, status: 'done' },
    { key: 'awarded', label: 'Awarded', count: 9, status: 'done' },
  ],
}

// Builds one committee-review row's vote track: BOARD_MEMBER_INITIALS in
// order, each with a `decision` of 'agreed' | null (nobody in the verified
// sample rows starts 'waitlisted'/'declined' -- those only ever appear
// after the interactive "you" buttons are clicked in-session), plus
// `isYou` flagging YOU_INITIALS. `agreed` stays as a plain derived getter
// wherever it's read (decision === 'agreed'), not stored twice.
function votes(agreedInitials) {
  return BOARD_MEMBER_INITIALS.map((initials) => ({
    initials,
    decision: agreedInitials.includes(initials) ? 'agreed' : null,
    isYou: initials === YOU_INITIALS,
  }))
}

// Applicants currently in committee review, awaiting a board vote. Only
// 2026 (the active cycle) has any -- 2025/2024 are closed, so their
// committee review is empty (rendered as an empty state, not broken).
export const COMMITTEE_REVIEW_BY_CYCLE = {
  2026: [
    {
      id: 'APP-014',
      avatar: 'JD',
      finalScore: 4.6,
      stageText: 'Both interviewers scored · ready for a vote',
      scholarshipType: 'Amazon Think Big Scholarship',
      amount: '$4,000',
      votes: votes(['MR', 'KS', 'DP']),
    },
    {
      id: 'APP-027',
      avatar: 'RS',
      finalScore: 4.3,
      stageText: 'Both interviewers scored · ready for a vote',
      scholarshipType: null, // "Not yet set"
      amount: null, // "Not yet set"
      votes: votes(['MR', 'KS', 'DP']),
    },
    {
      id: 'APP-041',
      avatar: 'MK',
      finalScore: 4.1,
      stageText: 'Both interviewers scored · ready for a vote',
      scholarshipType: null,
      amount: null,
      votes: votes([]), // nobody has agreed yet, including "you"
    },
  ],
  2025: [],
  2024: [],
}

// Already-decided applicants, most recent first. 2026 has the four
// verified sample cards; 2025/2024 get a smaller, clearly-different set
// so the cycle switch is obviously not just re-showing the same rows.
export const RECENT_DECISIONS_BY_CYCLE = {
  2026: [
    {
      id: 'APP-003',
      avatar: 'TL',
      decidedLabel: 'Decided Sep 15',
      finalScore: 4.9,
      pill: 'Awarded',
      scholarshipType: 'Amazon Think Big Scholarship',
      awardKind: 'Full award',
      amount: '$4,000',
      agreedCount: 5,
    },
    {
      id: 'APP-009',
      avatar: 'CW',
      decidedLabel: 'Decided Sep 15',
      finalScore: 4.7,
      pill: 'Awarded',
      scholarshipType: 'Amazon Think Big Scholarship',
      awardKind: 'Partial award',
      amount: '$2,000',
      agreedCount: 5,
    },
    {
      id: 'APP-018',
      avatar: 'NP',
      decidedLabel: 'Decided Sep 14',
      finalScore: 3.9,
      pill: 'Waitlisted',
      scholarshipType: 'Amazon Think Big Scholarship',
      awardKind: 'Pending an award opening',
      amount: null, // rendered as an em dash, not "$0"
      agreedCount: 5,
    },
    {
      id: 'APP-022',
      avatar: 'BH',
      decidedLabel: 'Decided Sep 14',
      finalScore: 3.1,
      pill: 'Declined',
      scholarshipType: 'Amazon Think Big Scholarship',
      awardKind: 'Did not meet committee bar',
      amount: null,
      agreedCount: 5,
    },
  ],
  2025: [
    {
      id: 'APP-101',
      avatar: 'GS',
      decidedLabel: 'Decided Aug 30',
      finalScore: 4.8,
      pill: 'Awarded',
      scholarshipType: 'Amazon Think Big Scholarship',
      awardKind: 'Full award',
      amount: '$4,000',
      agreedCount: 5,
    },
    {
      id: 'APP-114',
      avatar: 'FQ',
      decidedLabel: 'Decided Aug 28',
      finalScore: 3.0,
      pill: 'Declined',
      scholarshipType: 'Amazon Think Big Scholarship',
      awardKind: 'Did not meet committee bar',
      amount: null,
      agreedCount: 5,
    },
  ],
  2024: [
    {
      id: 'APP-201',
      avatar: 'IW',
      decidedLabel: 'Decided Sep 2',
      finalScore: 4.5,
      pill: 'Awarded',
      scholarshipType: 'BTX Legacy Award',
      awardKind: 'Full award',
      amount: '$2,000',
      agreedCount: 5,
    },
    {
      id: 'APP-210',
      avatar: 'QL',
      decidedLabel: 'Decided Aug 30',
      finalScore: 3.8,
      pill: 'Waitlisted',
      scholarshipType: 'Amazon Think Big Scholarship',
      awardKind: 'Pending an award opening',
      amount: null,
      agreedCount: 5,
    },
  ],
}
