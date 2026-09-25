// PLACEHOLDER interview slots for the pilot interview week -- swap for the
// real dates/times (or a fetched schedule) once available. Each slot's id
// is a stable "YYYY-MM-DD-HHMM" string, not its array index, so previously
// persisted selections in store.selectedSlots keep working even if this
// list gets reordered or extended later.
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
