// MOCK: the Instagram page's sample (demo apps/design/ops-refresh/directions/p-instagram), drawn for Tue Nov 10, 2026.
// Normal, stress (long titles, other owners, a long caption) and empty, in the shape of lib/instagram-view.ts.
import type { IgCaps, IgPerson, IgPost, IgView } from '@/lib/instagram-view';

const P = (id: string, name: string, initials: string): IgPerson => ({ id: `mock-staff-${id}`, name, initials });

/** The board, in the demo's order (the owner picker's order). */
export const IG_BOARD: IgPerson[] = [
  P('dm', 'Dana Mercer', 'DM'),
  P('kd', 'Keith Dawson', 'KD'),
  P('ck', 'Camila Keane', 'CK'),
  P('md', 'Miles Donovan', 'MD'),
  P('tf', 'Toby Faraday', 'TF'),
  P('cg', 'Charlie Gaines', 'CG'),
  P('ds', 'Dorian Sutton', 'DS'),
  P('pn', 'Priya Natarajan', 'PN'),
];
const [DANA, KEITH, CAMILA, , , , DORIAN] = IG_BOARD;

const CAP_KEITH = 'Meet Keith Dawson, BTX board president and Clark School engineering alum. Keith interviews our scholarship applicants every cycle. Questions for Keith? Drop them below.';
const CAP_LEGACY =
  'The Legacy Scholarship is open to Black engineering students at the University of Maryland. Each fall one student receives $2,500 toward tuition, books and fees. Applicants are scored by the BTX board on community engagement, resilience, leadership and academic promise.';

const ALL = [true, true, true, true, true];
const NONE = [false, false, false, false, false];

// One sample post with the defaults filled in.
const post = (p: Partial<IgPost> & Pick<IgPost, 'id' | 'title' | 'date' | 'owner'>): IgPost => ({
  steps: [...NONE],
  caption: null,
  photo: '[Photo]',
  sent: false,
  sentAt: null,
  approver: KEITH,
  captionBy: null,
  slug: null,
  note: null,
  ...p,
});

// The demo's five posts (stress swaps in longer words and other people).
function posts(stress: boolean): IgPost[] {
  return [
    post({ id: 'ig1', title: 'Applications close Friday', date: '2026-11-02', owner: DANA, steps: [...ALL], caption: stress ? CAP_LEGACY : null }),
    post({ id: 'ig2', title: 'Meet the board: Keith Dawson', date: '2026-11-05', owner: DANA, steps: [...ALL], caption: CAP_KEITH, photo: '[Photo of Keith]' }),
    stress
      ? post({ id: 'ig3', title: 'Announce the Legacy Scholarship at the NSBE event and cocktail hour', slug: 'NSBE event', date: '2026-11-11', owner: DORIAN, approver: CAMILA, captionBy: CAMILA, steps: [false, true, false, false, false] })
      : post({ id: 'ig3', title: 'Interview week', slug: 'interview-week', date: '2026-11-11', owner: DANA, captionBy: KEITH, steps: [false, true, false, false, false] }),
    post({ id: 'ig4', title: 'Certification program teaser', date: '2026-11-21', owner: null, approver: stress ? DORIAN : KEITH }),
    post({ id: 'ig5', title: 'Legacy Scholarship winner', date: '2026-12-01', owner: stress ? DORIAN : DANA, approver: stress ? DORIAN : KEITH, note: 'Starts once the winner is announced' }),
  ];
}

/** Mock mode draws every control the demo draws. */
export const IG_MOCK_CAPS: IgCaps = { add: true, send: true, tick: true, caption: true, owner: true, nudge: true, undo: true, next: true };

const base: Omit<IgView, 'posts'> = { today: '2026-11-10', target: 4, channelId: 'mock-channel-instagram', staff: IG_BOARD, me: DANA.id, caps: IG_MOCK_CAPS, loadFailed: false, mockWrite: null };

export const IG_VIEW: IgView = { ...base, posts: posts(false) };
export const IG_VIEW_STRESS: IgView = { ...base, posts: posts(true) };
export const IG_VIEW_EMPTY: IgView = { ...base, posts: [] };
