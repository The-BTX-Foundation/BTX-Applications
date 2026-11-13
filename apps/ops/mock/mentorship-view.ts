// MOCK: the Mentorship page's sample data, in the demo's shape and on its sample day (Tue Nov 10, 2026): the demo's
// dataFor() and chatData() (apps/design/ops-refresh/directions/p-mentorship). lib/mentorship-view-loader.ts returns these
// when there is no Supabase env. The steps have no owners or dates (as the demo); stress adds the unowned step, the longest
// title and a due date.
import type { MentorshipView, MsCaps, MsMessage, MsStep } from '@/lib/mentorship-view';

/** Mock mode draws every demo behaviour. */
export const MS_MOCK_CAPS: MsCaps = { tick: true, undo: true, share: true, send: true };

// One open step with the defaults the demo leaves out.
const step = (id: string, title: string, o: Partial<MsStep> = {}): MsStep => ({
  id,
  title,
  done: false,
  reopenAs: 'open',
  unassigned: false,
  due: null,
  sub: null,
  share: false,
  approval: false,
  ...o,
});

const STEPS: MsStep[] = [
  step('m1', 'Write the program goals and guidelines', { done: true }),
  step('m2', 'Draft the mentor application', { done: true }),
  step('m3', 'Recruit mentors', { share: true }),
  step('m4', 'Match mentors and students'),
  step('m5', 'Set the launch date', { sub: 'No launch date yet' }),
];

const MESSAGES: MsMessage[] = [
  { id: 'mc1', day: 'Yesterday', who: 'BTX', initials: 'BT', bot: true, mine: false, time: '4:00 PM', text: 'Certification program planning call is set for Thu Nov 19 at 7:00 PM.' },
  { id: 'mc2', day: 'Yesterday', who: 'Toby Faraday', initials: 'TF', bot: false, mine: false, time: '4:30 PM', text: 'The FE exam would help a lot of our seniors.' },
  { id: 'mc3', day: 'Today', who: 'You', initials: 'DM', bot: false, mine: true, time: '8:40 AM', text: "Agreed. Let's bring 2 or 3 ideas each to the call." },
];

/** The normal sample. */
export const MS_VIEW: MentorshipView = {
  failed: false,
  today: '2026-11-10',
  me: { userId: 'dm', initials: 'DM' },
  status: 'Not active yet',
  loadFailed: false,
  steps: STEPS,
  chat: { failed: false, title: 'Programs chat', people: 7, messages: MESSAGES, channelId: 'mock-programs' },
  checklistId: 'mock-checklist',
  caps: MS_MOCK_CAPS,
};

/** Stress: the recruiting step has no owner, the longest step title, and the launch step has a date (Thu Dec 31). */
export const MS_VIEW_STRESS: MentorshipView = {
  ...MS_VIEW,
  steps: [
    STEPS[0],
    STEPS[1],
    { ...STEPS[2], unassigned: true },
    { ...STEPS[3], title: 'Announce the Legacy Scholarship at the NSBE event and cocktail hour' },
    { ...STEPS[4], due: '2026-12-31', sub: null },
  ],
};

/** Empty: the program has no steps yet. */
export const MS_VIEW_EMPTY: MentorshipView = { ...MS_VIEW, steps: [] };
