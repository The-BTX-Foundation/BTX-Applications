// MOCK: the refreshed Calendar page's sample, item for item the signed-off demo's data
// (apps/design/ops-refresh/directions/p-calendar/index.html: "now is Tue Nov 10, 2026, 9:14 AM", the SPEC.md board and cycle).
// The loader (lib/calendar-view-loader.ts) returns these in mock mode; live mode builds the same shape from the real tables.
import type { CalendarView, CalViewItem } from '@/lib/calendar-view';

const PEOPLE = [
  { id: 'dana', name: 'Dana Mercer' },
  { id: 'keith', name: 'Keith Dawson' },
  { id: 'camila', name: 'Camila Keane' },
  { id: 'miles', name: 'Miles Donovan' },
  { id: 'toby', name: 'Toby Faraday' },
  { id: 'charlie', name: 'Charlie Gaines' },
  { id: 'dorian', name: 'Dorian Sutton' },
  { id: 'priya', name: 'Priya Natarajan' },
];

// One item with the defaults the sample leaves out.
const it = (o: Partial<CalViewItem> & Pick<CalViewItem, 'id' | 'kind' | 'date' | 'title'>): CalViewItem => ({
  area: 'scholarships',
  endDate: null,
  time: null,
  code: null,
  chip: o.title,
  people: [],
  waiting: null,
  done: false,
  ...o,
});
// An interview: the student's name is the title, the application number its code.
const iv = (id: string, date: string, time: number, student: string, code: string, people: string[]) => it({ id, kind: 'interview', date, time, title: student, code, chip: 'Interview', people });

const BASE: CalViewItem[] = [
  it({ id: 'apps', kind: 'span', date: '2026-10-12', endDate: '2026-11-06', title: 'Applications open', chip: 'Applications, to Fri Nov 6' }),
  it({ id: 'win', kind: 'span', date: '2026-11-10', endDate: '2026-11-20', title: 'Interviews', chip: 'Interviews, to Fri Nov 20' }),
  it({ id: 'sent', kind: 'cycle', date: '2026-11-10', time: 8 * 60 + 1, title: 'Interview times sent to all 21 students', chip: 'Times sent', done: true }),
  it({
    id: 'ig',
    kind: 'post',
    area: 'outreach',
    date: '2026-11-11',
    title: 'Instagram post: interview week',
    chip: 'Instagram',
    people: ['dana'],
    waiting: { personId: 'keith', what: 'caption', draft: "Hi Keith, could you send the caption for tomorrow's interview-week post?" },
  }),
  it({ id: 'rem', kind: 'task', date: '2026-11-12', title: "Remind the 16 students who haven't booked", chip: 'Reminder', people: ['dana'] }),
  it({ id: 'prep', kind: 'task', date: '2026-11-12', title: "Prep for Ada Okafor's interview", chip: 'Prep', people: ['dana'] }),
  iv('i11', '2026-11-12', 17 * 60 + 30, 'Ada Okafor', 'APP-2026-00011', ['dana', 'keith']),
  iv('i13', '2026-11-13', 17 * 60, 'Lena Mensah', 'APP-2026-00013', ['camila', 'miles']),
  it({ id: 'q4', kind: 'task', area: 'money', date: '2026-11-13', title: 'Approve the Q4 budget ($4,830)', chip: 'Q4 budget', people: ['dana'] }),
  iv('i04', '2026-11-15', 11 * 60, 'Naomi Brooks', 'APP-2026-00004', ['toby', 'charlie']),
  iv('i15', '2026-11-17', 17 * 60, 'Sade Price', 'APP-2026-00015', ['dorian', 'priya']),
  iv('i12', '2026-11-18', 17 * 60, 'Tariq Wells', 'APP-2026-00012', ['dana', 'camila']),
  it({ id: 'cert', kind: 'event', area: 'programs', date: '2026-11-19', time: 19 * 60, title: 'Certification planning call', chip: 'Cert call' }),
  it({ id: 'scores', kind: 'cycle', date: '2026-11-22', title: 'Scores due' }),
  it({ id: 'grant', kind: 'task', area: 'money', date: '2026-11-23', title: 'Shortlist 5 grants to apply for', chip: 'Grant list', people: ['keith'] }),
  it({ id: 'sel', kind: 'event', date: '2026-11-24', time: 19 * 60, title: 'Selection meeting', chip: 'Selection' }),
  it({ id: 'award', kind: 'cycle', date: '2026-11-30', title: 'Award announced', chip: 'Award out' }),
  it({ id: 'winner', kind: 'post', area: 'outreach', date: '2026-11-30', title: 'Winner post' }),
];

// Stress: Thu Nov 12 is crowded, the longest real name books, the longest event title from the app's stress data.
const STRESS: CalViewItem[] = [
  ...BASE,
  iv('s1', '2026-11-12', 21 * 60 + 30, 'Adaeze-Grace Nwachukwu-Bello', 'APP-2026-00119', ['camila', 'dorian']),
  iv('s2', '2026-11-12', 8 * 60, 'Isaac Boateng', 'APP-2026-00120', ['keith', 'toby']),
  it({ id: 's3', kind: 'event', date: '2026-11-12', title: 'Announce the Legacy Scholarship at the NSBE event and cocktail hour', chip: 'NSBE event', people: ['dana'] }),
];

const COMMON: Omit<CalendarView, 'items' | 'needs'> = {
  today: '2026-11-10',
  nowMin: 9 * 60 + 14,
  dateLabel: 'Tue, Nov 10',
  me: 'dana',
  people: PEOPLE,
  itemsFailed: false,
  // Mock mode: every control is drawn and changes the page's own state, like the demo.
  caps: { add: true, undoAdd: true, share: true, nudge: true },
};

const NEEDS: CalendarView['needs'] = {
  title: 'Share the interview schedule with the board',
  dueOn: '2026-11-09',
  action: 'Share with the board',
  doneText: 'Interview schedule sent to the board in board chat',
};

/** The demo's normal state. */
export const CALENDAR_VIEW: CalendarView = { ...COMMON, items: BASE, needs: NEEDS };
/** `?demo=stress`. */
export const CALENDAR_VIEW_STRESS: CalendarView = { ...COMMON, items: STRESS, needs: NEEDS };
/** `?demo=empty`: nothing set yet, no card. */
export const CALENDAR_VIEW_EMPTY: CalendarView = { ...COMMON, items: [], needs: null };
