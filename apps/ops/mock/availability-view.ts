// Interviews > Your availability: the demo's sample (p-availability), for mock mode only. Dana Mercer's free time across
// Tue Nov 10 to Fri Nov 20, 2026 (today is Tue Nov 10), two booked interviews, two private names, a limit of 5, sent
// Mon Nov 2, 6:14 PM. Stress has split days, the longest names and six names; empty has nothing at all.
import type { MinuteRange } from '@/lib/free-ranges';
import type { AvailabilityView, AvBooking } from '@/lib/availability-view';
import { windowDays } from '@/lib/free-ranges';

const DAYS = windowDays('2026-11-10', '2026-11-20');
const day = (n: number) => `2026-11-${String(n).padStart(2, '0')}`;
const span = (n: number, s: number, e: number): MinuteRange => ({ day: day(n), startMin: s, endMin: e });

const NORMAL: MinuteRange[] = [...[10, 11, 12, 13, 16, 18, 20].map((n) => span(n, 1020, 1260)), span(14, 600, 840)].sort((a, b) => a.day.localeCompare(b.day));

const STRESS: MinuteRange[] = [
  ...[10, 11, 12, 16, 18, 20].map((n) => span(n, 1020, 1260)),
  span(13, 1020, 1110),
  span(13, 1140, 1260),
  span(14, 540, 720),
  span(14, 780, 1020),
  span(14, 1080, 1260),
  span(15, 480, 1320),
].sort((a, b) => a.day.localeCompare(b.day) || a.startMin - b.startMin);

// The two booked interviews (Ada Thu 5:30 PM with Keith Dawson, Tariq Wed 5:00 PM with Camila Keane).
const booked = (ada: string): AvBooking[] => [
  { id: 'APP-2026-00011', day: day(12), min: 1050, applicant: ada, withName: 'Keith Dawson', withInitials: 'KD' },
  { id: 'APP-2026-00012', day: day(18), min: 1020, applicant: 'Tariq Wells', withName: 'Camila Keane', withInitials: 'CK' },
];

const BASE: AvailabilityView = {
  today: '2026-11-10',
  term: 'Fall 2026',
  days: DAYS,
  me: { initials: 'DM' },
  ranges: NORMAL,
  maxInterviews: 5,
  text: 'Weekdays after 5 except Tuesday and Thursday next week. Saturday 10 to 2.',
  sentAt: '2026-11-02T23:14:00Z',
  dueOn: '2026-11-06',
  conflicts: ['Jordan Pierce', 'Amara Okafor'],
  bookings: booked('Ada Okafor'),
  noDates: false,
  loadFailed: false,
  caps: { send: true, reader: true, bookings: true, mock: true },
  failFirst: { send: false },
};

/** The normal sample. */
export const AV_VIEW: AvailabilityView = BASE;

/** Stress: split days, the longest names, six names. */
export const AV_VIEW_STRESS: AvailabilityView = {
  ...BASE,
  ranges: STRESS,
  bookings: booked('Adaeze-Grace Nwachukwu-Bellamy'),
  conflicts: ['Adaeze-Grace Nwachukwu-Bello', 'Jordan Pierce', 'Amara Okafor', 'Whitney Kamara', 'Folake Nwosu', 'Isaac Boateng'],
};

/** Empty: no free time, no bookings, no names, no limit, never sent. */
export const AV_VIEW_EMPTY: AvailabilityView = { ...BASE, ranges: [], bookings: [], conflicts: [], maxInterviews: null, sentAt: null, text: '' };

/** The mock "Sent" time: today at 9:14 AM Eastern (the demo's "today, 9:14 AM"). */
export const AV_MOCK_SENT = '2026-11-10T14:14:00Z';
