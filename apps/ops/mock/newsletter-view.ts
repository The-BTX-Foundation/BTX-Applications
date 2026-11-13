// MOCK: the Newsletter page's sample data in the refreshed page's shape (lib/newsletter-view.ts), copied from the demo
// (apps/design/ops-refresh/directions/p-newsletter, which took it from mock/outreach.ts and moved the October issue to
// November 2026). The sample day is Tue Nov 10, 2026, and the viewer is Dana Mercer, as on every demo page. Mock mode only;
// live mode reads newsletter_issues, newsletter_sections and outreach_channels.
import type { NlOwner, NlSection, NlView } from '@/lib/newsletter-view';

// A sample board member (Dana Mercer is the viewer).
const who = (name: string): NlOwner => ({
  name,
  initials: name
    .split(' ')
    .map((w) => w[0])
    .join(''),
  mine: name === 'Dana Mercer',
});

const S1: NlSection = { id: 'n1', title: 'Board spotlight: Keith Dawson', blurb: 'Meet the board president and Clark School alum.', status: 'done', owner: who('Dana Mercer'), waits: null, waitNote: null };
const S2: NlSection = { id: 'n2', title: 'Legacy Scholarship winner', blurb: 'Who won, and what it means for them.', status: 'not_started', owner: who('Dana Mercer'), waits: '2026-11-24', waitNote: 'Can be written once the board picks' };
const S3: NlSection = { id: 'n3', title: 'Certification program is coming', blurb: 'BTX will pay exam fees for up to 5 students.', status: 'not_started', owner: who('Toby Faraday'), waits: null, waitNote: null, pinned: true };
const S4: NlSection = { id: 'n4', title: 'Ways to give before Giving Tuesday', blurb: 'Three easy ways to help before Dec 1.', status: 'not_started', owner: who('Keith Dawson'), waits: null, waitNote: null };
const S5: NlSection = { id: 'n5', title: 'Dates for December', blurb: 'What is coming up and where to join.', status: 'not_started', owner: who('Dana Mercer'), waits: null, waitNote: null };

/** The normal state: the November issue, one of five sections done, Toby's section next. */
export const NL_VIEW: NlView = {
  today: '2026-11-10',
  issue: {
    heading: 'November issue',
    month: 'November',
    previewTitle: 'BTX news, November 2026',
    intro: 'Our fall Legacy Scholarship is nearly decided, and a new program is on the way.',
    sendOn: '2026-11-30',
    owner: who('Dana Mercer'),
  },
  sections: [S1, S2, S3, S4, S5],
  // The design's placeholders: the subscriber count, last issue and email tool are not known yet.
  facts: { subscribers: '[number]', lastIssue: '[month year]', tool: '[email tool]' },
  loadFailed: false,
  caps: { tick: true, undo: true, nudge: true, send: true, pastIssues: true },
};

/** The stress state: another owner, no subscribers, the longest real title with no owner. */
export const NL_VIEW_STRESS: NlView = {
  ...NL_VIEW,
  issue: { ...NL_VIEW.issue!, owner: who('Camila Keane') },
  sections: [
    S1,
    S2,
    { ...S3, owner: who('Dorian Sutton') },
    { ...S4, title: 'Announce the Legacy Scholarship at the NSBE event and cocktail hour', owner: null },
    S5,
  ],
  facts: { ...NL_VIEW.facts, subscribers: '0' },
};

/** The empty state: the November issue has no sections yet. */
export const NL_VIEW_EMPTY: NlView = { ...NL_VIEW, sections: [] };
