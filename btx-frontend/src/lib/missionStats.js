// Single source for the four "to date" scholarship figures shown on both
// the Headline Metric Summary page and Home's mission card, so the two
// pages can never drift out of sync with each other. PLACEHOLDER --
// hand-entered cumulative totals, not derived from any table; replace
// with real queries once the Historical Scholarship Database exists.
export const MISSION_STATS = {
  scholarsFundedToDate: 13,
  directAcademicAidTotal: 52020.48,
  applicantsEngagedTotal: 70,
  studentsReachedTotal: 288,
  // Student Reach breakdown -- scholars + travel + outreach should equal
  // studentsReachedTotal above (13 + 3 + 272 = 288).
  travelAwardees: 3,
  campusOutreachAttendees: 272,
  // Funding breakdown -- directAcademicAidTotal + conferenceTravelTotal
  // should equal Impact to Date's own $53,907.23 total funding figure.
  conferenceTravelTotal: 1886.75,
  // "Across 7 cycles" on Impact to Date's Scholars Awarded card.
  scholarshipCycles: 7,
}

// "$52,020" -- whole-dollar display for Home's mission card. Headline
// Metric Summary's own allocation table shows the same total to the cent
// instead (its pre-existing "$52,020.48" convention), formatted with its
// own toLocaleString call rather than through this helper.
export function formatWholeDollars(value) {
  return `$${Math.round(value).toLocaleString()}`
}
