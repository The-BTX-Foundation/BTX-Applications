// Canonical interview slot list -- MUST stay byte-for-byte identical to
// btx-frontend-portal/src/lib/interviewSlots.js's own INTERVIEW_SLOTS.
// Duplicated rather than shared across repos (these are two separate Vite
// apps with no shared package), but applicants (portal, Step 6) and board
// members (this Ops Hub page) both pick slot ids from this same list --
// run-interview-pairing can only match an applicant's selected_slots
// against a board member's scholarship_board_availability.slot_id when
// both sides used identical id strings. If the portal's list ever changes,
// this file needs updating to match, by hand.
//
// Each slot's id is a stable "YYYY-MM-DD-HHMM" string, not its array index,
// per the portal's own file header -- previously saved selections (on
// either side) keep working even if this list gets reordered or extended.
export const INTERVIEW_SLOTS = [
  { id: '2026-10-05-1400', date: 'Mon, Oct 5', time: '2:00 PM' },
  { id: '2026-10-05-1430', date: 'Mon, Oct 5', time: '2:30 PM' },
  { id: '2026-10-05-1500', date: 'Mon, Oct 5', time: '3:00 PM' },
  { id: '2026-10-05-1600', date: 'Mon, Oct 5', time: '4:00 PM' },
  { id: '2026-10-06-1000', date: 'Tue, Oct 6', time: '10:00 AM' },
  { id: '2026-10-06-1030', date: 'Tue, Oct 6', time: '10:30 AM' },
  { id: '2026-10-06-1300', date: 'Tue, Oct 6', time: '1:00 PM' },
  { id: '2026-10-06-1700', date: 'Tue, Oct 6', time: '5:00 PM' },
  { id: '2026-10-07-1100', date: 'Wed, Oct 7', time: '11:00 AM' },
  { id: '2026-10-07-1130', date: 'Wed, Oct 7', time: '11:30 AM' },
  { id: '2026-10-07-1530', date: 'Wed, Oct 7', time: '3:30 PM' },
  { id: '2026-10-07-1630', date: 'Wed, Oct 7', time: '4:30 PM' },
  { id: '2026-10-08-0900', date: 'Thu, Oct 8', time: '9:00 AM' },
  { id: '2026-10-08-0930', date: 'Thu, Oct 8', time: '9:30 AM' },
  { id: '2026-10-08-1400', date: 'Thu, Oct 8', time: '2:00 PM' },
  { id: '2026-10-08-1800', date: 'Thu, Oct 8', time: '6:00 PM' },
]
