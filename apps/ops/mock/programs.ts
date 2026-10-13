// MOCK: the Programs pages' sample data, copied from the Figma frames (Certifications, Sponsorships, Mentorship, normal
// and stress). The loaders in lib/programs.ts return these in mock mode; going live swaps each loader for the draft
// tables (programs, certification_ideas, sponsorships, checklists + tasks, chat_messages).
import { CHARIAH, CILLISHA, DANIA, DARIEN, KELSEY, TOMI, type AreaChat, type Owner } from './area';

export type StepState = 'done' | 'next' | 'todo';

export type CertStep = {
  id: string;
  title: string;
  /** Laptop second line ("Planning call 7:00 PM", "Not started"). */
  sub: string;
  owner: Owner;
  /** "Thu Oct 1" and the small "Done" under it, or "From January". */
  due?: string;
  dueNote?: string;
  state: StepState;
  /** The gold button on the next step. */
  action?: string;
  /** Phone: the line under the title ("Dania Morris · Thu Oct 22 call"). */
  phoneSub: string;
};

export type CertIdea = { id: string; name: string; by: string; decision: 'not_decided' | 'chosen' | 'dropped' };

export type CertData = {
  /** Live mode: the `programs` row id, needed to add an idea. */
  programId?: string;
  /** Live mode: the setup checklist's id (`checklists`), needed to add a step. */
  checklistId?: string;
  subtitle: string;
  phoneSub: string;
  plan: { budget: string; budgetNote: string; students: string; studentsNote: string; first: string; firstNote: string; ideasNote: string };
  checklist: { done: number; total: number; nowLabel: string; phoneNowLabel: string; steps: CertStep[] };
  ideas: CertIdea[];
  chat: AreaChat;
};

export const MOCK_CERT: CertData = {
  subtitle: 'Setting up · BTX pays exam fees so students can earn certifications',
  phoneSub: 'Programs · setting up · 1 of 5 steps',
  plan: {
    budget: '$1,500',
    budgetNote: 'Q4 2026',
    students: 'up to 5',
    studentsNote: 'About $300 each',
    first: 'To pick',
    firstNote: 'Planning call Thu Oct 22',
    ideasNote: 'Not decided',
  },
  checklist: {
    done: 1,
    total: 5,
    nowLabel: 'Pick the first certifications',
    phoneNowLabel: 'Pick certifications',
    steps: [
      { id: 'c1', title: 'Agree the program goal', sub: '', owner: null, due: 'Thu Oct 1', dueNote: 'Done', state: 'done', phoneSub: 'Thu Oct 1' },
      { id: 'c2', title: 'Pick the first certifications', sub: 'Planning call 7:00 PM', owner: DANIA, due: 'Thu Oct 22', state: 'next', action: 'Add an idea', phoneSub: 'Dania Morris · Thu Oct 22 call' },
      { id: 'c3', title: 'Set who can apply and how', sub: 'Not started', owner: TOMI, due: 'Fri Oct 30', state: 'todo', phoneSub: 'Tomi Falodun · Fri Oct 30' },
      { id: 'c4', title: 'Announce it on Instagram and in the newsletter', sub: 'Teaser Sat Oct 17 · newsletter Fri Oct 30', owner: DANIA, state: 'todo', phoneSub: 'Dania Morris · Fri Nov 13' },
      { id: 'c5', title: 'Pay exam fees and track results', sub: 'Not started · each fee paid also logs on Budget', owner: KELSEY, due: 'From January', state: 'todo', phoneSub: 'Kelsey Davis · From January' },
    ],
  },
  ideas: [
    { id: 'i1', name: 'FE exam (Fundamentals of Engineering)', by: 'Tomi Falodun', decision: 'not_decided' },
    { id: 'i2', name: 'AWS Certified Cloud Practitioner', by: 'Marcus Davis', decision: 'not_decided' },
    { id: 'i3', name: 'Lean Six Sigma Yellow Belt', by: 'Chariah Ghee', decision: 'not_decided' },
  ],
  chat: {
    title: 'Programs chat',
    people: 7,
    messages: [
      { id: 'm1', day: 'Yesterday', who: 'BTX', bot: true, time: '4:00 PM', text: 'Certification program planning call is set for Thu Oct 22 at 7:00 PM.' },
      { id: 'm2', day: 'Yesterday', who: 'Tomi Falodun', initials: 'TF', time: '4:30 PM', text: 'The FE exam would help a lot of our seniors.' },
      { id: 'm3', day: 'Today', who: 'You', mine: true, time: '8:40 AM', text: "Agreed. Let's bring 2 or 3 ideas each to the call." },
    ],
  },
};

export const MOCK_CERT_STRESS: CertData = {
  ...MOCK_CERT,
  plan: { budget: '$0', budgetNote: 'Not approved yet', students: '0', studentsNote: 'None picked yet', first: 'To pick', firstNote: 'Planning call Wed Sep 30, 9:30 PM', ideasNote: 'Not decided' },
  checklist: {
    ...MOCK_CERT.checklist,
    steps: [
      { id: 'c1', title: 'Agree the program goal', sub: '', owner: null, due: 'Wed Sep 30', dueNote: 'Done', state: 'done', phoneSub: 'Wed Sep 30' },
      { id: 'c2', title: 'Pick the first certifications', sub: 'Planning call 9:30 PM', owner: DANIA, due: 'Wed Sep 30', state: 'next', action: 'Add an idea', phoneSub: 'Cillisha Knights · Wed Sep 30 call' },
      { id: 'c3', title: 'Set who can apply and how', sub: 'Not started', owner: 'unassigned', due: 'Fri Oct 30', state: 'todo', phoneSub: 'Unassigned · Fri Oct 30' },
      { id: 'c4', title: 'Announce the Legacy Scholarship at the NSBE event and cocktail hour', sub: 'Teaser Sat Oct 17 · newsletter Fri Oct 30', owner: DANIA, state: 'todo', phoneSub: 'Cillisha Knights · Thu Dec 31' },
      { id: 'c5', title: 'Pay exam fees and track results', sub: 'Not started · each fee paid also logs on Budget', owner: KELSEY, due: 'From January', state: 'todo', phoneSub: 'Kelsey Davis · From January' },
    ],
  },
  ideas: [
    { id: 'i1', name: 'Fundamentals of Engineering (FE) Exam: Electrical and Computer', by: CILLISHA.name, decision: 'not_decided' },
    { id: 'i2', name: 'AWS Certified Cloud Practitioner', by: 'Marcus Davis', decision: 'not_decided' },
    { id: 'i3', name: 'Lean Six Sigma Yellow Belt', by: CHARIAH.name, decision: 'not_decided' },
  ],
  chat: {
    title: 'Programs chat',
    people: 7,
    messages: [
      { id: 'm1', day: 'Yesterday', who: 'BTX', bot: true, time: '9:30 PM', text: 'Certification program planning call is set for Thu Oct 22 at 7:00 PM.' },
      { id: 'm2', day: 'Yesterday', who: DARIEN.name, initials: DARIEN.initials, time: '8:00 AM', text: 'The FE exam would help a lot of our seniors.' },
      { id: 'm3', day: 'Today', who: 'You', mine: true, time: '8:00 AM', text: "Agreed. Let's bring 2 or 3 ideas each to the call." },
    ],
  },
};

// ---------- Sponsorships ----------

export type SponsorshipRow = {
  id: string;
  title: string;
  kind: 'conference' | 'travel' | 'fee' | 'other';
  students: number;
  amount: number;
  /** "Spring 2026" or "Thu Dec 31". */
  when: string;
  state: 'Done' | 'Not started';
  /** Phone second line ("Spring 2026 · also on Budget"). */
  phoneWhen: string;
};

export type SponsorshipsData = {
  year: number;
  rows: SponsorshipRow[];
  note: string;
  steps: { title: string; phoneTitle?: string; body: string; phoneBody: string }[];
};

const HOW: SponsorshipsData['steps'] = [
  { title: 'A request comes in', body: 'A student or an organization asks for help. It arrives in the board chat or by email.', phoneBody: 'A student or an organization asks for help.' },
  { title: 'The board agrees in chat', body: 'Board members talk it over in the board chat and agree on an amount.', phoneBody: 'Board members agree on an amount.' },
  { title: 'Dania Morris pays and keeps the receipt', phoneTitle: 'Dania pays and keeps the receipt', body: 'Dania Morris pays the cost and saves the receipt.', phoneBody: 'Dania Morris pays the cost and saves the receipt.' },
  { title: 'It is logged once, here', body: 'Logging it here also records the spending on Budget, under Sponsorships. Nobody logs it twice.', phoneBody: 'Logging it also records the spending on Budget.' },
];

export const MOCK_SPONSORSHIPS: SponsorshipsData = {
  year: 2026,
  rows: [{ id: 's1', title: 'NSBE convention', kind: 'conference', students: 5, amount: 2750, when: 'Spring 2026', state: 'Done', phoneWhen: 'Spring 2026 · also on Budget' }],
  note: 'Requests come in through the board chat or an email to the board.',
  steps: HOW,
};

export const MOCK_SPONSORSHIPS_STRESS: SponsorshipsData = {
  ...MOCK_SPONSORSHIPS,
  rows: [
    { id: 's1', title: 'NSBE convention', kind: 'conference', students: 12, amount: 3410, when: 'Spring 2026', state: 'Done', phoneWhen: 'Spring 2026 · also on Budget' },
    { id: 's2', title: 'Announce the Legacy Scholarship at the NSBE event and cocktail hour', kind: 'conference', students: 0, amount: 0, when: 'Thu Dec 31', state: 'Not started', phoneWhen: 'Thu Dec 31' },
  ],
};

// ---------- Mentorship ----------

export type MentorStep = {
  id: string;
  title: string;
  state: 'done' | 'todo';
  /** The right-hand text on a laptop row ("Done", "Not started"), or a button label. */
  status?: string;
  action?: string;
  /** "Unassigned" shown under the title (stress). */
  unassigned?: boolean;
  /** Phone: the line under the title and the pill. */
  phoneSub: string;
  phonePill?: string;
  phoneTitle?: string;
};

export type MentorData = {
  subtitle: string;
  phoneSub: string;
  launch: { value: string; note: string };
  done: number;
  total: number;
  nowLabel: string;
  steps: MentorStep[];
};

export const MOCK_MENTOR: MentorData = {
  subtitle: 'Planned, not active yet · launch date to be set',
  phoneSub: 'Programs · planned, not active',
  launch: { value: 'To be set', note: 'Nothing is scheduled' },
  done: 2,
  total: 5,
  nowLabel: 'Recruit mentors',
  steps: [
    { id: 'm1', title: 'Write the program goals and guidelines', state: 'done', status: 'Done', phoneSub: 'Done', phonePill: 'Done' },
    { id: 'm2', title: 'Draft the mentor application', state: 'done', status: 'Done', phoneSub: 'Done', phonePill: 'Done' },
    { id: 'm3', title: 'Recruit mentors', state: 'todo', action: 'Share the application', phoneSub: 'Not scheduled' },
    { id: 'm4', title: 'Match mentors and students', state: 'todo', status: 'Not started', phoneSub: 'Not scheduled', phonePill: 'Not started' },
    { id: 'm5', title: 'Set the launch date', state: 'todo', status: 'Not started', phoneSub: 'Not scheduled', phonePill: 'Not started' },
  ],
};

export const MOCK_MENTOR_STRESS: MentorData = {
  ...MOCK_MENTOR,
  steps: [
    MOCK_MENTOR.steps[0],
    MOCK_MENTOR.steps[1],
    { id: 'm3', title: 'Recruit mentors', state: 'todo', action: 'Share the application', unassigned: true, phoneSub: 'Unassigned · not scheduled' },
    { id: 'm4', title: 'Match mentors and students', phoneTitle: 'Announce the Legacy Scholarship at the NSBE event and cocktail hour', state: 'todo', status: 'Not started', phoneSub: 'Not scheduled', phonePill: 'Not started' },
    { id: 'm5', title: 'Set the launch date', state: 'todo', status: 'Not started', phoneSub: 'Thu Dec 31', phonePill: 'Not started' },
  ],
};
