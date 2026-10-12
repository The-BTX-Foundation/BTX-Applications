// Scholarships > Awardees: who won, where each follow-up stands, and the five awardee steps.
// LIVE: the published cycle's `scholarship_awards` (main and extra) with their `award_steps`, the code and initials from
// the blind view `application_reviews`, and past awards (kind 'past'). Names and email come from `applications` for
// admins only (D2); board members see the code and initials. MOCK (mock/awardees.ts): everything, in mock mode.
import { hasSupabaseEnv } from '@btx/data';
import { dateOnlyLabel, dayLabel } from './format';
import { blindRows, db, identityFor, publishedCycle, whoAmI } from './sch-live';
import { ANNOUNCED_ON, AWARDEES_NOW, AWARDEES_TERM, awardeeStore, AWARDS, PAST, type MockAward, type MockPast, type MockStep } from '@/mock/awardees';

export type Cells = {
  letter: [string, string];
  accepted: [string, string];
  /** True when the accepted cell is a waiting state (bold both lines). */
  waiting: boolean;
  payment: [string, string];
  paymentBold: boolean;
};

export type StepView = { step: number; title: string; sub: string; state: 'done' | 'now' | 'todo' };

export type AwardeeRow = {
  awardId: string;
  code: string;
  initials: string;
  fullName: string;
  email: string;
  awardName: string;
  amountLabel: string;
  kind: 'main' | 'extra';
  note: string;
  cells: Cells;
  done: number;
  steps: StepView[];
  /** "Acceptance form back" is the current step. */
  currentTitle: string;
  currentSub: string;
  comment: { by: string; byInitials: string; text: string } | null;
  /** The funds step logs the amount on Budget when it is ticked. */
  stepRowsKind: string[];
};

export type PastRow = { id: string; term: string; awardName: string; amountLabel: string; label: string };

export type AwardeesData = {
  term: string;
  terms: string[];
  sub: string;
  phoneSub: string;
  awardees: AwardeeRow[];
  total: string;
  totalParts: string;
  past: PastRow[];
  pastCount: number;
  failed: boolean;
  source: 'live' | 'mock';
};

const TITLES = ['Award letter sent', 'Acceptance form back', 'Payment details confirmed', 'Funds sent', 'Thank-you note and a photo for the awards post'];
const SHORT = ['award letter', 'acceptance form', 'payment details', 'funds', 'thank-you note'];

/** "$2,000", or "[amount]" when the amount is not set yet. */
export const money = (cents: number | null) => (cents === null ? '[amount]' : `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`);

// "BTX Think Big Scholarship" -> "Think Big".
const shortName = (n: string) => n.replace(/^BTX /, '').replace(/ (Scholarship|Award)$/, '');

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

function rowFor(a: MockAward, now: string): AwardeeRow {
  const store = awardeeStore();
  const ticked = store.done[a.id] ?? {};
  const steps = a.steps.map((s) => ({ ...s, done_at: s.done_at ?? ticked[s.step] ?? null, reminder_sent_at: store.reminders[`${a.id}`] && s.step === 2 && !s.reminder_sent_at ? store.reminders[a.id] : s.reminder_sent_at }));
  const firstOpen = steps.find((s) => !s.done_at)?.step ?? 0;
  const letter = a.letter_sent_at ?? steps[0]?.done_at ?? null;
  const accepted = a.accepted_at ?? steps[1]?.done_at ?? null;
  const since = letter ? daysBetween(letter, now) : 0;
  const cells: Cells = {
    letter: letter ? ['Sent', dayLabel(letter).split(' ').slice(1).join(' ')] : ['Not sent', ''],
    accepted: accepted ? ['Accepted', dayLabel(accepted).split(' ').slice(1).join(' ')] : ['Waiting', since >= 14 ? `Since ${dayLabel(letter ?? now).split(' ').slice(1).join(' ')}` : `${since} days`],
    waiting: !accepted,
    payment: a.paid_on ? ['Paid', dateOnlyLabel(a.paid_on).split(' ').slice(1).join(' ')] : a.payment_due_on ? ['Scheduled', dateOnlyLabel(a.payment_due_on).split(' ').slice(1).join(' ')] : ['Not yet', ''],
    paymentBold: true,
  };
  const views: StepView[] = steps.map((s, i) => {
    const state: StepView['state'] = s.done_at ? 'done' : s.step === firstOpen ? 'now' : 'todo';
    let sub = 'Not started';
    if (s.done_at) sub = `Done ${dayLabel(s.done_at)}`;
    else if (s.step === 2 && state === 'now') sub = s.reminder_sent_at ? `Waiting, reminder sent ${dayLabel(s.reminder_sent_at)}` : 'Waiting';
    else if (s.step === 4) sub = `${s.due_on ? `Due ${dateOnlyLabel(s.due_on)} · ` : ''}ticking it also logs ${a.amount_cents === null ? 'the payment' : money(a.amount_cents)} on Budget`;
    return { step: s.step, title: TITLES[i], sub, state };
  });
  const cur = views.find((v) => v.state === 'now');
  return {
    awardId: a.id,
    code: a.code,
    initials: a.initials,
    fullName: a.fullName,
    email: a.email,
    awardName: a.award_name,
    amountLabel: money(a.amount_cents),
    kind: a.kind,
    note: a.decision_note && a.kind === 'extra' ? a.decision_note : '',
    cells,
    done: views.filter((v) => v.state === 'done').length,
    steps: views,
    currentTitle: cur ? `${a.initials} ${SHORT[cur.step - 1]}` : `${a.initials} follow-up`,
    currentSub: cur?.sub ?? 'All five steps are done',
    comment: a.comment,
    stepRowsKind: steps.map((s) => s.kind),
  };
}

function totals(rows: AwardeeRow[], awards: { name: string; cents: number | null }[]) {
  const known = awards.filter((a) => a.cents !== null).reduce((n, a) => n + (a.cents as number), 0);
  const unknown = awards.some((a) => a.cents === null);
  const total = `Total ${money(known)}${unknown ? ' and [amount]' : ''}`;
  const parts = awards.map((a) => `${shortName(a.name)} ${money(a.cents)}`).join(' · ');
  return { total, parts, known, unknown, rows };
}

function build(list: MockAward[], past: MockPast[], now: string, source: 'live' | 'mock', term = AWARDEES_TERM, announcedOn: string | null = ANNOUNCED_ON): AwardeesData {
  const rows = list.map((a) => rowFor(a, now));
  const t = totals(rows, list.map((a) => ({ name: a.award_name, cents: a.amount_cents })));
  const announced = announcedOn ? `announced ${dateOnlyLabel(announcedOn)}` : 'not announced yet';
  const amounts = `${money(t.known)}${t.unknown ? ' and [amount]' : ''}`;
  const terms = [term, ...Array.from(new Set(past.map((p) => p.past_term)))];
  return {
    term,
    terms,
    sub: `${term} · ${list.length} award${list.length === 1 ? '' : 's'} · ${amounts}, ${announced}`,
    phoneSub: `Scholarships · ${list.length} award${list.length === 1 ? '' : 's'} · ${amounts}`,
    awardees: rows,
    total: t.total,
    totalParts: t.parts,
    past: past.map((p) => ({ id: p.id, term: p.past_term, awardName: p.award_name, amountLabel: money(p.amount_cents), label: p.awardee_label })),
    pastCount: past.length,
    failed: false,
    source,
  };
}

// The stress frame (Figma "Scholarships > Awardees, stress"): 3 awards with long names and amounts not set yet,
// 120 past awards. Shown with ?demo=stress.
function stress(): AwardeesData {
  const steps = (waiting: string, funds: string, done: string): StepView[] => [
    { step: 1, title: TITLES[0], sub: done, state: 'done' },
    { step: 2, title: TITLES[1], sub: waiting, state: 'now' },
    { step: 3, title: TITLES[2], sub: 'Not started', state: 'todo' },
    { step: 4, title: TITLES[3], sub: funds, state: 'todo' },
    { step: 5, title: TITLES[4], sub: 'Not started', state: 'todo' },
  ];
  const mk = (o: Partial<AwardeeRow> & Pick<AwardeeRow, 'awardId' | 'code' | 'initials' | 'awardName' | 'amountLabel' | 'cells' | 'done'>): AwardeeRow => ({
    fullName: 'Awardee name',
    email: 'awardee@example.org',
    kind: 'extra',
    note: '',
    steps: steps('Waiting, reminder sent Wed Sep 30', 'Due Thu Dec 31 · ticking it also logs the payment on Budget', 'Done Wed Sep 30'),
    currentTitle: `${o.initials} acceptance form`,
    currentSub: 'Waiting, reminder sent Wed Sep 30',
    comment: { by: 'Darien Strachan', byInitials: 'DS', text: 'R.S. was close to the top. Glad we opened the Empowerment award.' },
    stepRowsKind: [],
    ...o,
  });
  return {
    term: AWARDEES_TERM,
    terms: [AWARDEES_TERM, 'Spring 2025', 'Spring 2024'],
    sub: 'Fall 2026 · 3 awards · $4,500 and [amount], announced Wed Sep 30',
    phoneSub: 'Scholarships · 3 awards · $4,500 and [amount]',
    awardees: [
      mk({ awardId: 's1', code: 'APP-2026-00003', initials: 'J.T.', awardName: 'BTX Think Big Scholarship', amountLabel: '$4,000', kind: 'main', cells: { letter: ['Sent', 'Sep 30'], accepted: ['Accepted', 'Oct 24'], waiting: false, payment: ['Scheduled', 'Dec 31'], paymentBold: true }, done: 2 }),
      mk({ awardId: 's2', code: 'APP-2026-00014', initials: 'R.S.', awardName: 'BTX Community Impact Award', amountLabel: '[amount]', note: 'Opened at the selection meeting', cells: { letter: ['Sent', 'Oct 23'], accepted: ['Waiting', '3 days'], waiting: true, payment: ['Not yet', ''], paymentBold: true }, done: 1 }),
      mk({ awardId: 's3', code: 'APP-2026-00120', initials: 'A-G.O.', awardName: 'Empowerment', amountLabel: '$500', cells: { letter: ['Sent', 'Oct 23'], accepted: ['Waiting', 'Since Sep 30'], waiting: true, payment: ['Not yet', ''], paymentBold: true }, done: 1 }),
    ],
    total: 'Total $4,500 and [amount]',
    totalParts: 'Think Big $4,000 · Community Impact [amount] · Empowerment $500',
    past: [],
    pastCount: 120,
    failed: false,
    source: 'mock',
  };
}

// Loads the awardees page. A failed read returns failed: true instead of throwing.
export async function loadAwardees(opts: { forceError?: boolean; stress?: boolean } = {}): Promise<AwardeesData> {
  if (!hasSupabaseEnv()) {
    if (opts.forceError) return { ...build([], [], AWARDEES_NOW, 'mock'), failed: true };
    if (opts.stress) return stress();
    return build(AWARDS, PAST, AWARDEES_NOW, 'mock');
  }
  try {
    return await live();
  } catch {
    return { ...build([], [], new Date().toISOString(), 'live'), failed: true };
  }
}

type AwardDb = {
  id: string;
  application_id: string | null;
  award_name: string;
  amount_cents: number | null;
  kind: 'main' | 'extra' | 'past';
  decision_note: string | null;
  letter_sent_at: string | null;
  accepted_at: string | null;
  payment_due_on: string | null;
  paid_on: string | null;
  past_term: string | null;
  awardee_label: string | null;
  award_steps: MockStep[] | null;
};

// "2026-10-23" (Eastern) from a timestamp.
const easternDate = (ts: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(ts));

// Live mode (see the header). The awardees table reads as the signed-in person (admin and board).
async function live(): Promise<AwardeesData> {
  const client = await db();
  const me = await whoAmI(client);
  if (!me) throw new Error('not staff');
  const cycle = await publishedCycle(client);
  const now = new Date().toISOString();
  const cols = 'id, application_id, award_name, amount_cents, kind, decision_note, letter_sent_at, accepted_at, payment_due_on, paid_on, past_term, awardee_label, award_steps(step, kind, due_on, done_at, note, reminder_sent_at)';
  const [current, past] = await Promise.all([
    cycle ? client.from('scholarship_awards').select(cols).eq('cycle_id', cycle.id).in('kind', ['main', 'extra']).order('decided_at') : Promise.resolve({ data: [], error: null }),
    client.from('scholarship_awards').select('id, past_term, award_name, amount_cents, awardee_label, past_term_starts').eq('kind', 'past').order('past_term_starts', { ascending: false }),
  ]);
  if (current.error) throw current.error;
  if (past.error) throw past.error;
  const awards = (current.data ?? []) as AwardDb[];
  const apps = cycle ? await blindRows(client, cycle.id) : [];
  const byId = new Map(apps.map((a) => [a.id, a]));
  const who = await identityFor(client, me, awards.map((a) => a.application_id).filter((x): x is string => Boolean(x)));
  const list: MockAward[] = awards.map((a) => {
    const app = a.application_id ? byId.get(a.application_id) : undefined;
    const id = a.application_id ? who.get(a.application_id) : undefined;
    const steps = [...(a.award_steps ?? [])].sort((x, y) => x.step - y.step);
    return {
      id: a.id,
      code: app?.applicant_code ?? '—',
      initials: app?.initials ?? '—',
      fullName: id?.full_name ?? '',
      email: id?.terpmail ?? '',
      award_name: a.award_name,
      amount_cents: a.amount_cents,
      kind: a.kind === 'extra' ? 'extra' : 'main',
      decision_note: a.decision_note,
      letter_sent_at: a.letter_sent_at,
      accepted_at: a.accepted_at,
      payment_due_on: a.payment_due_on,
      paid_on: a.paid_on,
      steps,
      comment: null,
    };
  });
  const pastRows: MockPast[] = ((past.data ?? []) as { id: string; past_term: string; award_name: string; amount_cents: number | null; awardee_label: string | null }[]).map((p) => ({
    id: p.id,
    past_term: p.past_term,
    award_name: p.award_name,
    amount_cents: p.amount_cents ?? 0,
    awardee_label: p.awardee_label ?? '',
  }));
  const announced = cycle?.decisions_released_at ? easternDate(cycle.decisions_released_at) : null;
  return build(list, pastRows, now, 'live', cycle?.term ?? 'No open cycle', announced);
}
