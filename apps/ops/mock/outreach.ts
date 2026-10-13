// MOCK: the Outreach pages' sample data, copied from the Figma frames (Plan, Instagram, Newsletter, normal and stress).
// The loaders in lib/outreach.ts return these in mock mode; going live swaps each loader for the draft tables
// (outreach_channels, posts, newsletter_issues, newsletter_sections, checklists + tasks). Post images, newsletter
// subscriber numbers and newsletter sending are not stored yet (README-ops-hub.md), so they stay on this mock.
import { CILLISHA, DANIA, DARIEN, KELSEY, TOMI, type Owner, type Person } from './area';

export type ChannelKind = 'instagram' | 'newsletter' | 'linkedin' | 'campus_events' | 'other';

// ---------- Plan ----------

export type ChannelCard = {
  id: string;
  kind: ChannelKind;
  name: string;
  /** "4 posts a month", or null for "[Not set]". */
  target: string | null;
  /** The line under the target ("Back on Fri Oct 30", "Not started"). */
  status: string;
  /** Instagram: the ring (done of target) and its line. */
  ring?: { done: number; total: number; line: string };
  owner: Person | null;
  /** Phone card: the big line and the lines under it. */
  phoneBig: string;
  phoneLines: string[];
};

export type PlanRow = {
  id: string;
  date: string;
  channel: 'instagram' | 'newsletter';
  what: string;
  next: string;
  owner: Owner;
  state: { label: string; kind: 'text' | 'muted' | 'pill' };
  /** Phone: "Wed Oct 7 · Instagram" and the owner line. */
  phoneMeta: string;
  phoneOwner: string;
};

export type PlanData = {
  /** Live mode: the Instagram channel's id, needed to add a post. */
  instagramChannelId?: string;
  cards: ChannelCard[];
  month: string;
  rows: PlanRow[];
  staff: Person[];
};

const STAFF: Person[] = [DANIA, KELSEY, TOMI];

export const MOCK_PLAN: PlanData = {
  cards: [
    { id: 'ch1', kind: 'instagram', name: 'Instagram', target: '4 posts a month', status: '', ring: { done: 0, total: 4, line: 'October: 3 planned, 0 posted' }, owner: DANIA, phoneBig: '0/4', phoneLines: ['4 posts a month · 3 planned in October'] },
    { id: 'ch2', kind: 'newsletter', name: 'Newsletter', target: 'Monthly email', status: 'Back on Fri Oct 30', owner: DANIA, phoneBig: 'Monthly', phoneLines: ['Back on Fri Oct 30'] },
    { id: 'ch3', kind: 'linkedin', name: 'LinkedIn', target: null, status: 'Not started', owner: null, phoneBig: 'Not started', phoneLines: ['Target [not set]'] },
    { id: 'ch4', kind: 'campus_events', name: 'Campus events', target: null, status: 'Not started', owner: null, phoneBig: 'Not started', phoneLines: ['Target [not set]'] },
  ],
  month: 'October',
  rows: [
    { id: 'p1', date: 'Wed Oct 7', channel: 'instagram', what: 'Meet the board: Kelsey Davis', next: 'Next: Kelsey Davis approves the caption', owner: DANIA, state: { label: 'Waiting on the board', kind: 'text' }, phoneMeta: 'Wed Oct 7 · Instagram', phoneOwner: 'Dania Morris · Kelsey approves the caption' },
    { id: 'p2', date: 'Sat Oct 17', channel: 'instagram', what: 'Certification program teaser', next: 'Next: pick an owner', owner: 'unassigned', state: { label: 'Not started', kind: 'muted' }, phoneMeta: 'Sat Oct 17 · Instagram', phoneOwner: 'Unassigned · pick an owner' },
    { id: 'p3', date: 'Fri Oct 23', channel: 'instagram', what: 'Legacy Scholarship winner', next: 'Starts once the winner is announced', owner: DANIA, state: { label: 'Not started', kind: 'muted' }, phoneMeta: 'Fri Oct 23 · Instagram', phoneOwner: 'Dania Morris' },
    { id: 'p4', date: 'Fri Oct 30', channel: 'newsletter', what: 'October issue', next: 'Next: write the certification section', owner: DANIA, state: { label: 'Drafting', kind: 'pill' }, phoneMeta: 'Fri Oct 30 · Newsletter', phoneOwner: 'Dania Morris' },
  ],
  staff: STAFF,
};

export const MOCK_PLAN_STRESS: PlanData = {
  ...MOCK_PLAN,
  cards: [
    { ...MOCK_PLAN.cards[0], ring: { done: 0, total: 12, line: 'October: 12 planned, 0 posted' }, owner: CILLISHA, phoneBig: '0/12', phoneLines: ['4 posts a month · 12 planned in October'] },
    { ...MOCK_PLAN.cards[1], status: 'Back on Thu Dec 31', phoneLines: ['Back on Thu Dec 31'] },
    MOCK_PLAN.cards[2],
    MOCK_PLAN.cards[3],
  ],
  rows: [
    { id: 'p1', date: 'Wed Sep 30', channel: 'instagram', what: 'Meet the board: Kelsey Davis', next: 'Next: Cillisha Knights approves the caption', owner: DARIEN, state: { label: 'Waiting on the board', kind: 'text' }, phoneMeta: 'Wed Sep 30 · Instagram', phoneOwner: 'Darien Strachan · Cillisha K. approves the caption' },
    { id: 'p2', date: 'Sat Oct 17', channel: 'instagram', what: 'Announce the Legacy Scholarship at the NSBE event and cocktail hour', next: 'Next: pick an owner', owner: 'unassigned', state: { label: 'Not started', kind: 'muted' }, phoneMeta: 'Sat Oct 17 · Instagram', phoneOwner: 'Unassigned · pick an owner' },
    { id: 'p3', date: 'Fri Oct 23', channel: 'instagram', what: 'Legacy Scholarship winner', next: 'Starts once the winner is announced', owner: DANIA, state: { label: 'Not started', kind: 'muted' }, phoneMeta: 'Fri Oct 23 · Instagram', phoneOwner: 'Dania Morris' },
    { id: 'p4', date: 'Thu Dec 31', channel: 'newsletter', what: 'October issue', next: 'Next: write the certification section', owner: DANIA, state: { label: 'Drafting', kind: 'pill' }, phoneMeta: 'Thu Dec 31 · Newsletter', phoneOwner: 'Dania Morris' },
  ],
  staff: [DARIEN, CILLISHA, DANIA, KELSEY, TOMI],
};

// ---------- Instagram ----------

export type PostStep = { title: string; state: 'done' | 'now' | 'todo' };

export type Post = {
  id: string;
  title: string;
  /** "Wed Oct 7". */
  date: string;
  owner: Owner;
  /** Steps done of 5. */
  done: number;
  /** "Ready to send to Kelsey", "Not started", "Posted". */
  state: string;
  /** Phone: the state text ("Waiting on the board") and whether it is a pill. */
  phoneState: string;
  group: 'upcoming' | 'posted';
  /** The board member who approves ("Kelsey Davis"). */
  approver: string;
  caption: string | null;
  /** The placeholder in the photo box ("[Photo of Kelsey]"). */
  photo: string;
  sent?: boolean;
};

export type InstagramData = {
  channelId?: string;
  subtitle: string;
  phoneSub: string;
  /** "October", and how many posts it holds (can be more than are listed). */
  monthLabel: string;
  monthCount: number;
  target: string;
  posts: Post[];
  pastLabel: string;
  pastCount: number;
  staff: Person[];
};

const CAPTION_KELSEY = 'Meet Kelsey Davis, BTX board president and Clark School engineering alum. Kelsey interviews our scholarship applicants every cycle. Questions for Kelsey? Drop them below.';
const CAPTION_LEGACY =
  'The Legacy Scholarship is open to Black engineering students at the University of Maryland. Each fall one student receives $2,000 toward tuition, books and fees. Applicants are scored by the BTX board on community engagement, resilience, leadership and academic promise.';

export const MOCK_INSTAGRAM: InstagramData = {
  subtitle: 'Next post Wed Oct 7 · ready to send to Kelsey',
  phoneSub: 'Outreach · October · 3 planned, 0 posted',
  monthLabel: 'October',
  monthCount: 3,
  target: '4 a month',
  posts: [
    { id: 'p1', title: 'Meet the board: Kelsey Davis', date: 'Wed Oct 7', owner: DANIA, done: 2, state: 'Ready to send to Kelsey', phoneState: 'Waiting on the board', group: 'upcoming', approver: 'Kelsey Davis', caption: CAPTION_KELSEY, photo: '[Photo of Kelsey]' },
    { id: 'p2', title: 'Certification program teaser', date: 'Sat Oct 17', owner: 'unassigned', done: 0, state: 'Not started', phoneState: 'Not started', group: 'upcoming', approver: 'Kelsey Davis', caption: null, photo: '[Photo]' },
    { id: 'p3', title: 'Legacy Scholarship winner', date: 'Fri Oct 23', owner: DANIA, done: 0, state: 'Not started', phoneState: 'Not started', group: 'upcoming', approver: 'Kelsey Davis', caption: null, photo: '[Photo]' },
    { id: 'p4', title: 'Applications close Monday', date: 'Sat Sep 12', owner: DANIA, done: 5, state: 'Posted', phoneState: 'Posted', group: 'posted', approver: 'Kelsey Davis', caption: null, photo: '[Photo]' },
    { id: 'p5', title: 'Interviews start this week', date: 'Tue Sep 15', owner: DANIA, done: 5, state: 'Posted', phoneState: 'Posted', group: 'posted', approver: 'Kelsey Davis', caption: null, photo: '[Photo]' },
  ],
  pastLabel: 'September, posted',
  pastCount: 2,
  staff: STAFF,
};

export const MOCK_INSTAGRAM_STRESS: InstagramData = {
  ...MOCK_INSTAGRAM,
  subtitle: 'Next post Wed Sep 30 · ready to send to Darien',
  phoneSub: 'Outreach · October · 12 planned, 0 posted',
  monthCount: 12,
  posts: [
    { id: 'p1', title: 'Announce the Legacy Scholarship at the NSBE event and cocktail hour', date: 'Wed Sep 30', owner: DANIA, done: 2, state: 'Ready to send to Darien', phoneState: 'Waiting on the board', group: 'upcoming', approver: 'Darien Strachan', caption: CAPTION_LEGACY, photo: '[Photo]' },
    { id: 'p2', title: 'Certification program teaser', date: 'Sat Oct 17', owner: 'unassigned', done: 0, state: 'Not started', phoneState: 'Not started', group: 'upcoming', approver: 'Darien Strachan', caption: null, photo: '[Photo]' },
    { id: 'p3', title: 'Legacy Scholarship winner', date: 'Fri Oct 23', owner: DARIEN, done: 0, state: 'Not started', phoneState: 'Not started', group: 'upcoming', approver: 'Darien Strachan', caption: null, photo: '[Photo]' },
    MOCK_INSTAGRAM.posts[3],
    MOCK_INSTAGRAM.posts[4],
  ],
  staff: [DARIEN, CILLISHA, DANIA, KELSEY, TOMI],
};

// ---------- Newsletter ----------

export type Section = {
  id: string;
  title: string;
  /** The short name used in "now ..." lines ("Certification program"). */
  short?: string;
  blurb: string;
  state: 'done' | 'todo' | 'next';
  /** Laptop second line ("Done", "Not started", "Next section to write"). */
  sub: string;
  owner: Owner;
  /** "Waits for Fri Oct 23" or "Next · Tomi Falodun", shown before the owner. */
  tag?: string;
  /** Phone: the line under the title and the right-hand label (a pill, or plain text when `phoneText`). */
  phoneSub: string;
  phoneLabel: string;
  phoneText?: boolean;
};

export type NewsletterData = {
  channelId?: string;
  issueId?: string;
  subtitle: string;
  phoneSub: string;
  issueTitle: string;
  previewTitle: string;
  intro: string;
  sendOn: string;
  owner: Person;
  sections: Section[];
  /** The footer strip: subscribers, last issue, email tool. */
  subscribers: string;
  lastIssue: string;
  tool: string;
  staff: Person[];
};

export const MOCK_NEWSLETTER: NewsletterData = {
  subtitle: "Next: Tomi's certification section · sends Fri Oct 30",
  phoneSub: 'Outreach · monthly email · back Fri Oct 30',
  issueTitle: 'October issue',
  previewTitle: 'BTX news, October 2026',
  intro: 'Our fall Legacy Scholarship is nearly decided, and a new program is on the way.',
  sendOn: 'Fri Oct 30',
  owner: DANIA,
  sections: [
    { id: 'n1', title: 'Board spotlight: Kelsey Davis', blurb: 'Meet the board president and Clark School alum.', state: 'done', sub: 'Done', owner: DANIA, phoneSub: 'Dania Morris', phoneLabel: 'Done' },
    { id: 'n2', title: 'Legacy Scholarship winner', blurb: 'Who won, and what it means for them.', state: 'todo', sub: 'Can be written once the winner is announced', owner: DANIA, tag: 'Waits for Fri Oct 23', phoneSub: 'Dania Morris · waits for Fri Oct 23', phoneLabel: 'Waiting' },
    { id: 'n3', title: 'Certification program is coming', short: 'Certification program', blurb: 'BTX will pay exam fees for up to 5 students.', state: 'next', sub: 'Next section to write', owner: TOMI, tag: 'Next · Tomi Falodun', phoneSub: 'Tomi Falodun', phoneLabel: 'Next · Tomi', phoneText: true },
    { id: 'n4', title: 'Ways to give before Giving Tuesday', blurb: 'Three easy ways to help before Dec 1.', state: 'todo', sub: 'Not started', owner: KELSEY, phoneSub: 'Kelsey Davis', phoneLabel: 'Not started' },
    { id: 'n5', title: 'Dates for November', blurb: 'What is coming up and where to join.', state: 'todo', sub: 'Not started', owner: DANIA, phoneSub: 'Dania Morris', phoneLabel: 'Not started' },
  ],
  subscribers: '[number]',
  lastIssue: '[month year]',
  tool: '[email tool]',
  staff: STAFF,
};

export const MOCK_NEWSLETTER_STRESS: NewsletterData = {
  ...MOCK_NEWSLETTER,
  subtitle: "Next: Darien's certification section · sends Thu Dec 31",
  phoneSub: 'Outreach · monthly email · back Thu Dec 31',
  sendOn: 'Thu Dec 31',
  owner: CILLISHA,
  sections: [
    MOCK_NEWSLETTER.sections[0],
    { ...MOCK_NEWSLETTER.sections[1], tag: 'Waits for Wed Sep 30', phoneSub: 'Dania Morris · waits for Wed Sep 30' },
    { ...MOCK_NEWSLETTER.sections[2], owner: DARIEN, tag: 'Next · Darien Strachan', phoneSub: 'Darien Strachan', phoneLabel: 'Next · Darien' },
    { id: 'n4', title: 'Announce the Legacy Scholarship at the NSBE event and cocktail hour', blurb: 'Three easy ways to help before Dec 1.', state: 'todo', sub: 'Not started', owner: 'unassigned', phoneSub: 'Unassigned', phoneLabel: 'Not started' },
    MOCK_NEWSLETTER.sections[4],
  ],
  subscribers: '0',
  staff: [DARIEN, CILLISHA, DANIA, KELSEY, TOMI],
};
