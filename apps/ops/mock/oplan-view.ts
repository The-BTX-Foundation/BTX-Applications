// MOCK: the Outreach Plan page's sample data in the refreshed shape (lib/oplan-view.ts), taken from the demo's makeItems()
// and chansHTML() (apps/design/ops-refresh/directions/p-outreach-plan/index.html): the normal, stress and empty states,
// dated from the sample day Tue Nov 10, 2026. Names are the made-up board from the demo. Each call returns fresh copies,
// so the page can change its own state without touching the sample.
import type { PnCaps, PnChan, PnItem, PnPerson, PnView } from '@/lib/oplan-view';

/** The sample day every mock date is counted from (same as Today). */
export const PN_TODAY = '2026-11-10';
/** The viewer in mock mode (requireStaff's mock user). */
export const PN_ME = 'dm';

/** The made-up board, in the demo's order (ids are the lower-case initials; "dm" is the viewer). */
export const PN_PEOPLE: PnPerson[] = [
  { id: 'dm', name: 'Dana Mercer', initials: 'DM' },
  { id: 'kd', name: 'Keith Dawson', initials: 'KD' },
  { id: 'ck', name: 'Camila Keane', initials: 'CK' },
  { id: 'md', name: 'Miles Donovan', initials: 'MD' },
  { id: 'tf', name: 'Toby Faraday', initials: 'TF' },
  { id: 'cg', name: 'Charlie Gaines', initials: 'CG' },
  { id: 'ds', name: 'Dorian Sutton', initials: 'DS' },
  { id: 'pn', name: 'Priya Natarajan', initials: 'PN' },
];

/** Mock mode: every control works on the page's own state, like the demo. */
export const PN_MOCK_CAPS: PnCaps = { addPost: true, parse: true, addIssue: true, nudge: true, pickOwner: true, undo: true, nKey: true };

// One item with the defaults filled in.
function item(i: Partial<PnItem> & Pick<PnItem, 'id' | 'ch' | 'title' | 'date'>): PnItem {
  return { owner: null, posted: false, postedWord: i.ch === 'Newsletter' ? 'Sent' : 'Posted', steps: 0, sections: null, waitOn: null, slug: null, note: null, ...i };
}

// The demo's six items (stress swaps in the long title and other owners).
function items(stress: boolean): PnItem[] {
  return [
    item({ id: 'ig1', ch: 'Instagram', title: 'Applications close Friday', date: '2026-11-02', owner: 'dm', posted: true, steps: 5 }),
    item({ id: 'ig2', ch: 'Instagram', title: 'Meet the board: Keith Dawson', date: '2026-11-05', owner: 'dm', posted: true, steps: 5 }),
    stress
      ? item({ id: 'ig3', ch: 'Instagram', title: 'Announce the Legacy Scholarship at the NSBE event and cocktail hour', slug: 'NSBE event', date: '2026-11-11', owner: 'ds', steps: 1, waitOn: 'ck' })
      : item({ id: 'ig3', ch: 'Instagram', title: 'Interview week', slug: 'interview-week', date: '2026-11-11', owner: 'dm', steps: 1, waitOn: 'kd' }),
    item({ id: 'ig4', ch: 'Instagram', title: 'Certification program teaser', date: '2026-11-21' }),
    item({ id: 'nl11', ch: 'Newsletter', title: 'November issue', date: '2026-11-30', owner: stress ? 'ck' : 'dm', sections: { done: 1, of: 5 } }),
    item({ id: 'ig5', ch: 'Instagram', title: 'Legacy Scholarship winner', date: '2026-12-01', owner: stress ? 'ds' : 'dm', note: 'Starts once the winner is announced' }),
  ];
}

// The demo's two channels (Instagram: target 4 a month; Newsletter: monthly).
function channels(stress: boolean): PnChan[] {
  const owner = stress ? 'ck' : 'dm';
  return [
    { id: 'ch-ig', kind: 'instagram', name: 'Instagram', target: 4, k: '', line: '', owner },
    { id: 'ch-nl', kind: 'newsletter', name: 'Newsletter', target: null, k: 'Monthly email', line: 'Issue goes out once a month', owner },
  ];
}

// One whole sample view.
function view(stress: boolean, empty: boolean): PnView {
  return {
    today: PN_TODAY,
    me: PN_ME,
    people: PN_PEOPLE.map((p) => ({ ...p })),
    items: empty ? [] : items(stress),
    channels: channels(stress),
    instagramId: 'ch-ig',
    loadFailed: false,
    caps: { ...PN_MOCK_CAPS },
  };
}

/** The normal sample. */
export const pnMockNormal = (): PnView => view(false, false);
/** The stress sample: long titles, other owners. */
export const pnMockStress = (): PnView => view(true, false);
/** Nothing planned yet. */
export const pnMockEmpty = (): PnView => view(false, true);
