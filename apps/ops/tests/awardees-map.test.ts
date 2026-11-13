// The Awardees page's pure logic (lib/awardees-map.ts): step words, the row line, the news card, totals, past terms, the
// live row mapping, the overlay of local changes, the mock clock, the funds outcome, paging, chunking, the write queue and
// the time limit.
import { describe, expect, it, vi } from 'vitest';
import {
  ALREADY_PAID,
  ALREADY_SENT_TEXT,
  alreadyMeans,
  pastTotalLabel,
  reseedErrs,
  settleStep,
  amountLabel,
  amountWord,
  announcedWords,
  awardsSig,
  awMoney,
  awRel,
  chain,
  chunked,
  curStep,
  defaultPick,
  doneCount,
  fundsOutcome,
  mapAwards,
  mapCycle,
  mapPast,
  mockClock,
  newsFor,
  pageRows,
  pastTerms,
  pendingWords,
  rowLine,
  shortAward,
  stepIndex,
  stepSub,
  totalLabel,
  withOver,
  withTimeout,
} from '@/lib/awardees-map';
import type { AwAward } from '@/lib/awardees-view';
import { AW_VIEW_AFTER, AW_VIEW_BEFORE } from '@/mock/awardees-view';

const TODAY = '2026-12-03';
const [JT, RS] = AW_VIEW_AFTER.awards;
// An award with the given steps done (others from Jalen's sample).
const award = (over: Partial<AwAward>): AwAward => ({ ...JT, ...over });

describe('money and names', () => {
  it('formats cents and missing amounts', () => {
    expect(awMoney(250000)).toBe('$2,500');
    expect(awMoney(75050)).toBe('$750.50');
    expect(awMoney(75005)).toBe('$750.05');
    expect(amountLabel(null)).toBe('Not set');
    expect(amountWord(null)).toBe('the payment');
    expect(amountWord(50000)).toBe('$500');
  });
  it('shortens award names', () => {
    expect(shortAward('BTX Legacy Scholarship')).toBe('Legacy');
    expect(shortAward('Empowerment Award')).toBe('Empowerment');
    expect(shortAward('Think Big')).toBe('Think Big');
  });
});

describe('step words', () => {
  it('says today, yesterday, tomorrow, else the date', () => {
    expect(awRel(TODAY, '2026-12-03T14:00:00Z')).toBe('today');
    expect(awRel(TODAY, '2026-12-02')).toBe('yesterday');
    expect(awRel(TODAY, '2026-12-04')).toBe('tomorrow');
    expect(awRel(TODAY, '2026-11-30')).toBe('Mon Nov 30');
  });
  it('finds the step that is now and counts the done ones', () => {
    expect(curStep(JT)).toBe(2);
    expect(doneCount(JT)).toBe(2);
    expect(curStep(award({ done: ['a', 'b', 'c', 'd', 'e'] }))).toBe(-1);
  });
  it('words each step as the demo, with "recorded" in live mode', () => {
    expect(stepSub(RS, 0, TODAY, false)).toBe('Done Mon Nov 30');
    expect(stepSub(RS, 1, TODAY, false)).toBe('Waiting since the letter, reminder sent yesterday');
    expect(stepSub(RS, 1, TODAY, true)).toBe('Waiting since the letter, reminder recorded yesterday');
    expect(stepSub(RS, 3, TODAY, false)).toBe('Due Mon Dec 14 · ticking it also logs $500 on Budget');
    expect(stepSub(award({ fundsDue: null, amountCents: null }), 3, TODAY, true)).toBe('Ticking it also logs the payment on Budget');
    expect(stepSub(award({ done: ['x', 'x', 'x', '2026-12-03T14:00:00Z', null] }), 3, TODAY, false)).toBe('Sent today · $2,500 logged on Budget');
    expect(stepSub(RS, 4, TODAY, false)).toBe('Not started');
  });
  it('gives each row its follow-up line', () => {
    expect(rowLine(JT)).toEqual({ kind: 'next', step: 'Payment details' });
    expect(rowLine(RS)).toEqual({ kind: 'wait' });
    expect(rowLine(award({ done: ['x', 'x', 'x', null, null] }))).toEqual({ kind: 'funds', due: 'Mon Dec 14' });
    expect(rowLine(award({ done: ['x', 'x', 'x', null, null], fundsDue: null }))).toEqual({ kind: 'funds', due: null });
    expect(rowLine(award({ done: ['x', 'x', 'x', 'x', 'x'] }))).toEqual({ kind: 'done' });
  });
});

describe('news card', () => {
  it('nudges a waiting acceptance form in mock, opens it in live', () => {
    expect(newsFor(AW_VIEW_AFTER.awards, TODAY, true)).toMatchObject({ id: 'rs', cta: 'Nudge', go: 'nudge', kicker: 'Acceptance form · waiting' });
    expect(newsFor(AW_VIEW_AFTER.awards, TODAY, false)).toMatchObject({ id: 'rs', cta: 'Open', go: 'open' });
  });
  it('skips a form reminded today and goes to the earliest funds due', () => {
    const rs = { ...RS, reminder: '2026-12-03T14:00:00Z' };
    expect(newsFor([JT, rs], TODAY, true)).toMatchObject({ id: 'jt', kicker: 'Funds due Mon Dec 14', cta: 'Open' });
  });
  it('then the last step, then nothing', () => {
    const last = award({ done: ['x', 'x', 'x', 'x', null] });
    expect(newsFor([last], TODAY, true)).toMatchObject({ kicker: 'Last step · thank-you note', gold: false });
    expect(newsFor([award({ done: ['x', 'x', 'x', 'x', 'x'] })], TODAY, true)).toBeNull();
    expect(newsFor([], TODAY, true)).toBeNull();
  });
});

describe('totals and past', () => {
  it('picks the awardee with the most follow-up', () => {
    expect(defaultPick(AW_VIEW_AFTER.awards)).toBe('rs');
    expect(defaultPick([])).toBeNull();
  });
  it('totals the term and says when an amount is missing', () => {
    expect(totalLabel(AW_VIEW_AFTER.awards)).toBe('Total $3,000');
    expect(totalLabel([JT, { ...RS, amountCents: null }])).toBe('Total $2,500, plus amounts not set');
  });
  it('groups past awards by term in order', () => {
    const t = pastTerms(AW_VIEW_BEFORE.past);
    expect(t.map((x) => [x.term, x.rows.length, x.total])).toEqual([
      ['Spring 2025', 7, 800000],
      ['Spring 2024', 7, 600000],
    ]);
  });
  it('words the cycle', () => {
    expect(pendingWords(AW_VIEW_BEFORE.cycle!)).toEqual({ meeting: '7:00 PM', hear: 'Mon Nov 30' });
    expect(announcedWords(AW_VIEW_AFTER.cycle)).toBe('Announced Mon Nov 30');
    expect(announcedWords(AW_VIEW_BEFORE.cycle)).toBe('Not announced yet');
    expect(announcedWords(null)).toBe('Not announced yet');
  });
});

describe('live rows', () => {
  it('maps awards with their steps and applications', () => {
    const rows = [
      {
        id: 'a1',
        application_id: 'p1',
        award_name: 'BTX Legacy Scholarship',
        amount_cents: 250000,
        kind: 'main',
        decision_note: 'ignored for main',
        payment_due_on: '2026-12-20',
        award_steps: [
          { step: 1, done_at: '2026-11-30T15:00:00Z', due_on: null, reminder_sent_at: null },
          { step: 2, done_at: null, due_on: null, reminder_sent_at: '2026-12-02T15:00:00Z' },
          { step: 4, done_at: null, due_on: '2026-12-14', reminder_sent_at: null },
          { step: 9, done_at: 'x' },
        ],
      },
      { id: 'a2', application_id: 'gone', award_name: 'Empowerment', amount_cents: null, kind: 'extra', decision_note: 'Opened', payment_due_on: '2026-12-21', award_steps: null },
    ];
    const apps = [{ id: 'p1', applicant_code: 'APP-1', full_name: ' Jalen Thomas ', terpmail: 'j@x.org' }];
    const [a, b] = mapAwards(rows, apps);
    expect(a).toMatchObject({ id: 'a1', code: 'APP-1', name: 'Jalen Thomas', email: 'j@x.org', award: 'Legacy', amountCents: 250000, kind: 'main', note: null, reminder: '2026-12-02T15:00:00Z', fundsDue: '2026-12-14', comment: null });
    expect(a.done).toEqual(['2026-11-30T15:00:00Z', null, null, null, null]);
    expect(b).toMatchObject({ code: '—', name: '—', email: '', award: 'Empowerment', amountCents: null, kind: 'extra', note: 'Opened', fundsDue: '2026-12-21' });
    expect(b.done).toEqual([null, null, null, null, null]);
  });
  it('maps past awards and the cycle', () => {
    expect(mapPast([{ id: 'p', past_term: '', award_name: 'BTX Legacy Scholarship', amount_cents: 100, awardee_label: 'G.A.' }])).toEqual([{ id: 'p', term: 'Earlier', award: 'Legacy', amountCents: 100, label: 'G.A.', main: true }]);
    const c = mapCycle({ term: 'Fall 2026', award_name: 'BTX Legacy Scholarship', award_amount_cents: 250000, decision_date: '2026-11-30', decisions_released_at: null }, { starts_at: '2026-11-25T00:00:00Z' });
    expect(c).toEqual({ term: 'Fall 2026', mainAward: 'Legacy', mainCents: 250000, meeting: 'Tue Nov 24, 7:00 PM', decisionDay: '2026-11-30', releasedAt: null });
    expect(mapCycle({ term: null }, undefined)).toMatchObject({ term: 'This term', mainAward: null, meeting: null, decisionDay: null });
  });
});

describe('local state', () => {
  it('lays local ticks and reminders over the server', () => {
    const [jt, rs] = withOver(AW_VIEW_AFTER.awards, { jt: { 2: 'now', 0: null } }, { rs: 'r' });
    expect(jt.done).toEqual([null, JT.done[1], 'now', null, null]);
    expect(rs.reminder).toBe('r');
    expect(withOver([JT], {})[0]).toBe(JT);
  });
  it('changes the signature when the server data changes', () => {
    const a = awardsSig(AW_VIEW_AFTER.awards);
    expect(awardsSig(withOver(AW_VIEW_AFTER.awards, { jt: { 2: 'x' } }))).not.toBe(a);
    expect(awardsSig(AW_VIEW_AFTER.awards)).toBe(a);
  });
  it('counts the mock clock from 9:00 AM, two minutes an action', () => {
    expect(mockClock(1)).toBe('9:02 AM');
    expect(mockClock(30)).toBe('10:00 AM');
    expect(mockClock(120)).toBe('1:00 PM');
  });
  it('maps step numbers to indexes', () => {
    expect(stepIndex(1)).toBe(0);
    expect(stepIndex(5)).toBe(4);
    expect(stepIndex(9)).toBe(4);
  });
  it('keeps "already sent" apart from saved', () => {
    expect(fundsOutcome({ ok: true, message: 'ok' })).toEqual({ kind: 'saved', message: 'ok' });
    expect(fundsOutcome({ ok: false, message: ALREADY_PAID }).kind).toBe('already');
    expect(fundsOutcome({ ok: false, message: 'Set the amount first.' })).toEqual({ kind: 'refused', message: 'Set the amount first.' });
  });
  it('reads "already sent" as saved only after this page\'s own unanswered try', () => {
    expect(alreadyMeans(true)).toBe('saved');
    expect(alreadyMeans(false)).toBe('already');
    expect(ALREADY_SENT_TEXT).toBe('Funds were already marked sent for this award.');
  });
});

describe('failed writes and refreshes', () => {
  const A = award({ id: 'a1', done: [null, null, null, null, null] });
  it('drops a failed newest write so the server value shows (tick, then untick, both fail)', () => {
    // Tick step 2: shown done locally; the write fails, so the server's "not done" shows again.
    let over = { a1: { 1: 'Nov 30' } };
    over = settleStep(over, 'a1', 1, false, true) as typeof over;
    expect(withOver([A], over)[0].done[1]).toBeNull();
    // Server says done; untick shows not done; that write fails too: the server's "done" shows, never a stale value.
    const B = award({ id: 'a1', done: [null, 'Nov 30', null, null, null] });
    const un = settleStep({ a1: { 1: null } }, 'a1', 1, false, true);
    expect(withOver([B], un)[0].done[1]).toBe('Nov 30');
    expect(un).toEqual({});
  });
  it('leaves saved and superseded writes alone', () => {
    const over = { a1: { 1: 'Nov 30', 2: 'Dec 1' } };
    expect(settleStep(over, 'a1', 1, true, true)).toBe(over);
    expect(settleStep(over, 'a1', 1, false, false)).toBe(over);
    expect(settleStep(over, 'a1', 1, false, true)).toEqual({ a1: { 2: 'Dec 1' } });
  });
  it('clears the error of a timed-out tick that later committed', () => {
    const before = [award({ id: 'a1', done: [null, null, null, null, null] })];
    const errs = { a1: { text: "Couldn't save. Try again.", i: 1, want: true } };
    // The refresh shows nothing new: the error stays.
    expect(reseedErrs(errs, before, before)).toEqual(errs);
    // The refresh shows the step done: it committed after all, so the error goes.
    const now = [award({ id: 'a1', done: [null, 'Nov 30', null, null, null] })];
    expect(reseedErrs(errs, before, now)).toEqual({});
    // A failed untick whose step shows not done also clears; a gone award drops its error.
    expect(reseedErrs({ a1: { text: 'x', i: 1, want: false } }, before, before)).toEqual({});
    expect(reseedErrs(errs, before, [])).toEqual({});
  });
  it('keeps a sticky money message through a refresh', () => {
    const before = [award({ id: 'a1', done: [null, null, null, null, null] })];
    const now = [award({ id: 'a1', done: [null, null, null, 'Dec 3', null] })];
    const errs = { a1: { text: ALREADY_SENT_TEXT, i: null, want: true, sticky: true } };
    expect(reseedErrs(errs, before, now)).toEqual(errs);
  });
});

describe('order and past totals', () => {
  it('puts main awards before extras, keeping the read order within each', () => {
    const apps = [{ id: 'p1', full_name: 'A' }, { id: 'p2', full_name: 'B' }, { id: 'p3', full_name: 'C' }];
    const awards = [
      { id: 'x1', kind: 'extra', application_id: 'p1', award_name: 'Empowerment', amount_cents: 1 },
      { id: 'm1', kind: 'main', application_id: 'p2', award_name: 'BTX Legacy Scholarship', amount_cents: 1 },
      { id: 'x2', kind: 'extra', application_id: 'p3', award_name: 'Empowerment', amount_cents: 1 },
    ];
    expect(mapAwards(awards, apps).map((a) => a.id)).toEqual(['m1', 'x1', 'x2']);
  });
  it('says when a past amount is not set', () => {
    const t = pastTerms([
      { id: '1', term: 'Spring 2025', award: 'Legacy', amountCents: 250000, label: 'A.B.', main: true },
      { id: '2', term: 'Spring 2025', award: 'Think Big', amountCents: null, label: 'C.D.', main: false },
      { id: '3', term: 'Fall 2024', award: 'Legacy', amountCents: 250050, label: 'E.F.', main: true },
    ]);
    expect(t.map(pastTotalLabel)).toEqual(['2 awards · $2,500, plus amounts not set', '1 award · $2,500.50']);
  });
});

describe('reads and writes', () => {
  it('pages until an empty page, continuing after short pages', async () => {
    const data = Array.from({ length: 2500 }, (_, i) => i);
    const asked: [number, number][] = [];
    const rows = await pageRows(async (from, to) => {
      asked.push([from, to]);
      return data.slice(from, Math.min(to + 1, from + 900));
    });
    expect(rows).toEqual(data);
    expect(asked[1]).toEqual([900, 1899]);
  });
  it('refuses partial data at the page ceiling', async () => {
    await expect(pageRows(async () => [1], 1, 3)).rejects.toThrow(/partial/);
  });
  it('chunks ids by 100', () => {
    const c = chunked(Array.from({ length: 250 }, (_, i) => i));
    expect(c.map((x) => x.length)).toEqual([100, 100, 50]);
    expect(chunked([])).toEqual([]);
  });
  it('runs writes on one key in order, even after a failure', async () => {
    const q = new Map<string, Promise<unknown>>();
    const order: string[] = [];
    let release!: () => void;
    const first = chain(q, 'k', () => new Promise<void>((r) => (release = r)).then(() => { order.push('1'); throw new Error('no'); }));
    const second = chain(q, 'k', async () => { order.push('2'); return 2; });
    await Promise.resolve();
    expect(order).toEqual([]);
    release();
    await expect(first).rejects.toThrow();
    await expect(second).resolves.toBe(2);
    expect(order).toEqual(['1', '2']);
  });
  it('races a call against a time limit', async () => {
    vi.useFakeTimers();
    const slow = withTimeout(new Promise(() => {}), 15000);
    vi.advanceTimersByTime(15000);
    await expect(slow).resolves.toEqual({ kind: 'timeout' });
    vi.useRealTimers();
    await expect(withTimeout(Promise.resolve(3), 50)).resolves.toEqual({ kind: 'answer', value: 3 });
    await expect(withTimeout(Promise.reject(new Error('x')), 50)).resolves.toEqual({ kind: 'error' });
  });
});
