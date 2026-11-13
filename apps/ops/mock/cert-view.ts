// MOCK: the Certifications page's sample data in the refreshed shape (lib/cert-view.ts), taken from the demo's dataFor()
// (apps/design/ops-refresh/directions/p-certifications/index.html): the normal, stress and empty states, dated from the
// sample day Tue Nov 10, 2026. Names are the made-up board from the demo. Each call returns fresh copies, so the page can
// change its own state without touching the sample.
import type { CertCaps, CertChat, CertPerson, CertPlan, CertStep, CertView } from '@/lib/cert-view';

/** The sample day every mock date is counted from (same as Today). */
export const CERT_TODAY = '2026-11-10';
/** The viewer in mock mode (requireStaff's mock user). */
export const CERT_ME = 'dm';

/** The made-up board (ids are the lower-case initials; "dm" is the viewer). */
export const CERT_PEOPLE: CertPerson[] = [
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
export const CERT_MOCK_CAPS: CertCaps = { tick: true, addTask: true, parse: true, addIdea: true, decide: true, undo: true, nKey: true, chat: true };

// A person by initials, as a step owner ("You" is drawn for the viewer).
function owner(ini: string) {
  const p = CERT_PEOPLE.find((x) => x.initials === ini);
  if (!p) throw new Error(`no person ${ini}`);
  return { id: p.id, name: p.name, initials: p.initials, mine: p.id === CERT_ME };
}

// A person's name for "Suggested by" ("You" for the viewer).
const by = (ini: string) => (ini === 'DM' ? 'You' : (CERT_PEOPLE.find((x) => x.initials === ini)?.name ?? ini));

// One step with the defaults filled in.
function step(s: Partial<CertStep> & Pick<CertStep, 'id' | 'title' | 'position'>): CertStep {
  return { owner: null, unassigned: false, due: null, dueText: null, noDue: false, sub: null, call: null, ideas: false, status: 'open', approval: false, ...s };
}

// The Programs chat thread (normal and empty states).
function chat(): CertChat {
  return {
    title: 'Programs chat',
    people: 7,
    channelId: 'mock-programs',
    capped: false,
    failed: false,
    messages: [
      { id: 'm1', day: 'Yesterday', who: 'BTX', initials: '', bot: true, mine: false, time: '4:00 PM', text: 'Certification program planning call is set for Thu Nov 19 at 7:00 PM.' },
      { id: 'm2', day: 'Yesterday', who: 'Toby Faraday', initials: 'TF', bot: false, mine: false, time: '4:30 PM', text: 'The FE exam would help a lot of our seniors.' },
      { id: 'm3', day: 'Today', who: 'You', initials: 'DM', bot: false, mine: true, time: '8:40 AM', text: "Agreed. Let's bring 2 or 3 ideas each to the call." },
    ],
  };
}

// The plan strip of the normal and empty states.
const plan = (): CertPlan => ({ budget: '$1,500', note: 'Q4 2026', seats: 5, seatsLabel: '5 seats, none filled yet', line: 'BTX pays exam fees: about $300 each for up to five students' });

// The fields every mock view shares.
function base(): Pick<CertView, 'today' | 'me' | 'programId' | 'checklistId' | 'status' | 'people' | 'loadFailed' | 'caps'> {
  return { today: CERT_TODAY, me: CERT_ME, programId: 'mock-program', checklistId: 'mock-checklist', status: 'In setup', people: CERT_PEOPLE, loadFailed: false, caps: CERT_MOCK_CAPS };
}

/** The normal state: five steps (the second is now and holds three ideas), the $1,500 plan, three chat messages. */
export function certMockNormal(): CertView {
  return {
    ...base(),
    plan: plan(),
    steps: [
      step({ id: 'c1', title: 'Agree the program goal', due: '2026-10-29', status: 'done', position: 1 }),
      step({ id: 'c2', title: 'Pick the first certifications', owner: owner('DM'), due: '2026-11-19', call: '7:00 PM', ideas: true, position: 2 }),
      step({ id: 'c3', title: 'Set who can apply and how', owner: owner('TF'), due: '2026-11-27', position: 3 }),
      step({ id: 'c4', title: 'Announce it on Instagram and in the newsletter', owner: owner('DM'), sub: 'Teaser Sat Nov 14 · newsletter Fri Nov 27', noDue: true, position: 4 }),
      step({ id: 'c5', title: 'Pay exam fees and track results', owner: owner('KD'), dueText: 'From January', sub: 'Each fee paid also logs on Budget', position: 5 }),
    ],
    ideas: [
      { id: 'i1', name: 'FE exam (Fundamentals of Engineering)', by: by('TF'), decision: 'open' },
      { id: 'i2', name: 'AWS Certified Cloud Practitioner', by: by('MD'), decision: 'open' },
      { id: 'i3', name: 'Lean Six Sigma Yellow Belt', by: by('CG'), decision: 'open' },
    ],
    chat: chat(),
  };
}

/** The stress state: no budget yet, a late step with nobody, a step with no owner, long names. */
export function certMockStress(): CertView {
  return {
    ...base(),
    plan: { budget: '$0', note: 'not approved yet', seats: 0, seatsLabel: 'No seats yet', line: 'BTX pays exam fees: no students picked yet' },
    steps: [
      step({ id: 'c1', title: 'Agree the program goal', due: '2026-10-28', status: 'done', position: 1 }),
      step({ id: 'c2', title: 'Pick the first certifications', owner: owner('CK'), due: '2026-10-28', call: '9:30 PM', ideas: true, position: 2 }),
      step({ id: 'c3', title: 'Set who can apply and how', unassigned: true, due: '2026-11-27', position: 3 }),
      step({ id: 'c4', title: 'Announce the Legacy Scholarship at the NSBE event and cocktail hour', owner: owner('DM'), sub: 'Teaser Sat Nov 14 · newsletter Fri Nov 27', due: '2026-12-31', position: 4 }),
      step({ id: 'c5', title: 'Pay exam fees and track results', owner: owner('KD'), dueText: 'From January', sub: 'Each fee paid also logs on Budget', position: 5 }),
    ],
    ideas: [
      { id: 'i1', name: 'Fundamentals of Engineering (FE) Exam: Electrical and Computer', by: by('CK'), decision: 'open' },
      { id: 'i2', name: 'AWS Certified Cloud Practitioner', by: by('MD'), decision: 'open' },
      { id: 'i3', name: 'Lean Six Sigma Yellow Belt', by: by('CG'), decision: 'open' },
    ],
    chat: {
      ...chat(),
      messages: [
        { id: 'm1', day: 'Yesterday', who: 'BTX', initials: '', bot: true, mine: false, time: '9:30 PM', text: 'Certification program planning call is set for Wed Oct 28 at 9:30 PM.' },
        { id: 'm2', day: 'Yesterday', who: 'Dorian Sutton', initials: 'DS', bot: false, mine: false, time: '8:00 AM', text: 'The FE exam would help a lot of our seniors.' },
        { id: 'm3', day: 'Today', who: 'You', initials: 'DM', bot: false, mine: true, time: '8:00 AM', text: "Agreed. Let's bring 2 or 3 ideas each to the call." },
      ],
    },
  };
}

/** The empty state: the plan and the chat, no steps and no ideas. */
export function certMockEmpty(): CertView {
  return { ...certMockNormal(), steps: [], ideas: [] };
}
