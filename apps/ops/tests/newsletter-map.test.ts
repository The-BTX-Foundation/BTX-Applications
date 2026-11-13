// The Newsletter page's pure logic (lib/newsletter-map.ts): mapping, the next section, the news card, dates, the nudge
// draft, the untick status, the paged read and the per-section write queue.
import { describe, expect, it } from 'vitest';
import {
  allDone,
  chain,
  lastIssueLabel,
  leftWords,
  mapIssue,
  mapSections,
  mockClock,
  newsFor,
  nextSection,
  nlInitials,
  nlPaged,
  nudgeText,
  ownerOf,
  progress,
  reopenStatus,
  reseed,
  sectionsSig,
  sendLine,
  settleWrite,
  undoStatus,
  statusOf,
  subscribersLabel,
  waitWord,
  withStatus,
  type NlStaff,
} from '@/lib/newsletter-map';
import type { NlSection } from '@/lib/newsletter-view';

const staff: NlStaff = new Map([
  ['u1', { name: 'Dana Mercer', initials: 'DM' }],
  ['u2', { name: 'Toby Faraday', initials: '' }],
]);
const sec = (id: string, over: Partial<NlSection> = {}): NlSection => ({ id, title: `T${id}`, blurb: '', status: 'not_started', owner: null, waits: null, waitNote: null, ...over });

describe('mapping', () => {
  it('reads owners, marking the signed-in person, and builds initials when missing', () => {
    expect(ownerOf('u1', staff, 'u1')).toEqual({ name: 'Dana Mercer', initials: 'DM', mine: true });
    expect(ownerOf('u2', staff, 'u1')).toEqual({ name: 'Toby Faraday', initials: 'TF', mine: false });
    expect(ownerOf(null, staff, 'u1')).toBeNull();
    expect(ownerOf('nobody', staff, 'u1')).toBeNull();
    expect(nlInitials('Mary-Ann de Souza')).toBe('MA');
  });
  it('reads statuses safely', () => {
    expect(statusOf('done')).toBe('done');
    expect(statusOf('writing')).toBe('writing');
    expect(statusOf('weird')).toBe('not_started');
  });
  it('maps section rows', () => {
    const [s] = mapSections([{ id: 7, title: 'A', blurb: null, status: 'writing', owner_id: 'u2', waits_until: '2026-11-24T00:00:00', waits_note: 'Can be written once the board picks' }], staff, 'u1');
    expect(s).toEqual({ id: '7', title: 'A', blurb: '', status: 'writing', owner: { name: 'Toby Faraday', initials: 'TF', mine: false }, waits: '2026-11-24', waitNote: 'Can be written once the board picks' });
  });
  it('maps the issue: month heading, else the title; owner falls back to the channel owner', () => {
    const i = mapIssue({ title: 'BTX news', send_on: '2026-11-30', intro: 'Hi', owner_id: null }, staff, 'u1', 'u1');
    expect(i).toMatchObject({ heading: 'November issue', month: 'November', previewTitle: 'BTX news', sendOn: '2026-11-30', owner: { name: 'Dana Mercer' } });
    expect(mapIssue({ title: 'Spring', send_on: null }, staff, 'u1', null)).toMatchObject({ heading: 'Spring', month: null, sendOn: null, owner: null });
  });
  it('labels the last issue in Eastern time and the subscriber count', () => {
    expect(lastIssueLabel('2026-11-01T03:00:00Z')).toBe('October 2026');
    expect(lastIssueLabel(null)).toBe('None yet');
    expect(lastIssueLabel('nonsense')).toBe('None yet');
    expect(subscribersLabel({ audience_count: 412 })).toBe('412');
    expect(subscribersLabel({ audience_count: 0 })).toBe('0');
    expect(subscribersLabel({ audience_count: null })).toBe('Not set');
    expect(subscribersLabel(undefined)).toBe('Not set');
  });
});

describe('dates', () => {
  it('words a waiting day like the demo', () => {
    const t = '2026-11-10';
    expect(waitWord(t, '2026-11-09')).toBe('Mon Nov 9');
    expect(waitWord(t, '2026-11-10')).toBe('Today');
    expect(waitWord(t, '2026-11-11')).toBe('Tomorrow');
    expect(waitWord(t, '2026-11-13')).toBe('Fri');
    expect(waitWord(t, '2026-11-21')).toBe('Next Sat');
    expect(waitWord(t, '2026-11-24')).toBe('Tue Nov 24');
  });
});

describe('next section and news', () => {
  const t = '2026-11-10';
  const list = [sec('a', { status: 'done' }), sec('b', { waits: '2026-11-24' }), sec('c', { owner: { name: 'Toby Faraday', initials: 'TF', mine: false } }), sec('d')];
  it('skips done and waiting sections; a pinned open section wins', () => {
    expect(nextSection(list, null, t)?.id).toBe('c');
    expect(nextSection(list, 'd', t)?.id).toBe('d');
    expect(nextSection(list, 'a', t)?.id).toBe('c');
    expect(nextSection([sec('x', { waits: '2026-11-10' })], null, t)?.id).toBe('x');
  });
  it('counts progress and all done', () => {
    expect(progress(list)).toEqual({ done: 1, total: 4 });
    expect(allDone(list)).toBe(false);
    expect(allDone([])).toBe(false);
    expect(allDone([sec('a', { status: 'done' })])).toBe(true);
  });
  it('builds the news card', () => {
    expect(newsFor(list, null, t, 'BTX news', false)).toEqual({ id: 'c', kicker: 'Next section · Toby', title: 'Tc', icon: 'pen', gold: false });
    expect(newsFor([sec('z')], null, t, 'BTX news', false)).toMatchObject({ kicker: 'Next section · no owner', gold: true });
    expect(newsFor([sec('z', { owner: { name: 'Dana Mercer', initials: 'DM', mine: true } })], null, t, 'P', false)).toMatchObject({ kicker: 'Next section · yours', gold: true });
    expect(newsFor([sec('a', { status: 'done' })], null, t, 'BTX news', false)).toEqual({ id: 'send', kicker: 'Ready to send', title: 'BTX news', icon: 'mail', gold: true });
    expect(newsFor([sec('w', { waits: '2026-11-24' })], null, t, 'P', false)).toMatchObject({ kicker: 'Waits until Tue Nov 24', icon: 'wait', gold: false });
    expect(newsFor(list, null, t, 'P', true)).toBeNull();
    expect(newsFor([], null, t, 'P', false)).toBeNull();
  });
});

describe('words', () => {
  it('drafts the nudge and the sending line', () => {
    expect(nudgeText('Toby Faraday', 'November', '2026-11-30', 'Certification program is coming')).toBe('Hi Toby, the November newsletter goes out Mon Nov 30. How is the "Certification program is coming" section coming along?');
    expect(nudgeText('Toby Faraday', null, null, 'X')).toBe('Hi Toby, the newsletter goes out soon. How is the "X" section coming along?');
    expect(leftWords(1)).toBe('section is');
    expect(leftWords(4)).toBe('4 sections are');
  });
  it('counts the mock clock from 9:14 AM', () => {
    expect(mockClock(0)).toBe('9:14 AM');
    expect(mockClock(1)).toBe('9:15 AM');
    expect(mockClock(166)).toBe('12:00 PM');
  });
});

describe('local statuses', () => {
  it('lays local statuses over the server and keeps untouched sections identical', () => {
    const list = [sec('a'), sec('b')];
    const out = withStatus(list, { a: 'done', b: 'not_started' });
    expect(out[0].status).toBe('done');
    expect(out[1]).toBe(list[1]);
  });
  it('changes the signature when a status changes', () => {
    expect(sectionsSig([sec('a')])).not.toBe(sectionsSig([sec('a', { status: 'done' })]));
  });
  it('unticks to the remembered open status, never clobbering writing', () => {
    expect(reopenStatus({ a: 'writing' }, 'a')).toBe('writing');
    expect(reopenStatus({ a: 'not_started' }, 'a')).toBe('not_started');
    expect(reopenStatus({}, 'a')).toBe('not_started');
    expect(reopenStatus({ a: 'done' }, 'a')).toBe('not_started');
  });
});

describe('paged read', () => {
  it('reads until an empty page, starting each page after the rows read', async () => {
    const asks: [number, number][] = [];
    const data = [1, 2, 3, 4, 5];
    const rows = await nlPaged(async (from, to) => {
      asks.push([from, to]);
      return data.slice(from, Math.min(to + 1, from + 2));
    }, 3);
    expect(rows).toEqual(data);
    expect(asks[0]).toEqual([0, 2]);
    expect(asks[1]).toEqual([2, 4]);
  });
  it('refuses partial data at the ceiling', async () => {
    await expect(nlPaged(async () => [1], 1, 3)).rejects.toThrow(/refusing partial data/);
  });
});

describe('write queue', () => {
  it('runs writes on one key in order, even after a failure', async () => {
    const q = new Map<string, Promise<unknown>>();
    const seen: string[] = [];
    let release!: () => void;
    const first = chain(q, 'k', () => new Promise<void>((r) => (release = () => { seen.push('1'); r(); })));
    const failing = chain(q, 'k', async () => {
      seen.push('2');
      throw new Error('no');
    });
    const third = chain(q, 'k', async () => {
      seen.push('3');
      return 'ok';
    });
    // The first write starts on the next tick; nothing after it has run yet.
    await Promise.resolve();
    expect(seen).toEqual([]);
    release();
    await first;
    await expect(failing).rejects.toThrow('no');
    expect(await third).toBe('ok');
    expect(seen).toEqual(['1', '2', '3']);
  });
});

describe('sending line', () => {
  const t = '2026-11-10';
  it('marks a send day before today late, and keeps today and later as planned', () => {
    expect(sendLine(t, '2026-10-30', true, 2)).toEqual({ late: true, text: 'Planned for Oct 30, passed' });
    expect(sendLine(t, '2026-11-09', false, 2)).toEqual({ late: true, text: 'Planned for Nov 9, passed' });
    expect(sendLine('2027-01-05', '2026-12-30', true, 1)).toEqual({ late: true, text: 'Planned for Dec 30, 2026, passed' });
    expect(sendLine(t, '2026-11-10', true, 2)).toEqual({ late: false, text: 'Goes out Tue Nov 10, sent outside the Ops Hub' });
    expect(sendLine(t, '2026-11-30', true, 2)).toEqual({ late: false, text: 'Goes out Mon Nov 30, sent outside the Ops Hub' });
    expect(sendLine(t, null, true, 2)).toEqual({ late: false, text: 'Sent outside the Ops Hub' });
  });
  it('keeps the demo wording in mock mode', () => {
    expect(sendLine(t, '2026-11-30', false, 4)).toEqual({ late: false, text: 'Sends Mon Nov 30 once the last 4 sections are done' });
    expect(sendLine(t, null, false, 1)).toEqual({ late: false, text: 'Sends once the last section is done' });
  });
});

describe('write settling', () => {
  it('a refused newest write deletes the local status so the server value wins', () => {
    const over = { a: 'done' as const, b: 'writing' as const };
    expect(settleWrite(over, 'a', false, true)).toEqual({ b: 'writing' });
  });
  it('a write that went through, or an older write a newer one followed, changes nothing', () => {
    const over = { a: 'done' as const };
    expect(settleWrite(over, 'a', true, true)).toBe(over);
    expect(settleWrite(over, 'a', false, false)).toBe(over);
    expect(settleWrite(over, 'z', false, true)).toBe(over);
  });
  it('tick then untick, both refused: the stale tick is a no-op, the untick drops the override', () => {
    // Tick wrote 'done' (seq 1), the untick then set the local status back to 'writing' (seq 2).
    let over: Record<string, 'done' | 'writing' | 'not_started'> = { a: 'writing' };
    over = settleWrite(over, 'a', false, false);
    expect(over).toEqual({ a: 'writing' });
    over = settleWrite(over, 'a', false, true);
    expect(over).toEqual({});
  });
  it('re-seeds from new server data, clearing an error only when that write committed', () => {
    const server = [sec('a', { status: 'done' }), sec('b')];
    expect(reseed(server, { id: 'a', status: 'done' })).toEqual({ over: {}, err: null });
    const err = { id: 'b', status: 'done' as const };
    expect(reseed(server, err)).toEqual({ over: {}, err });
    expect(reseed(server, null)).toEqual({ over: {}, err: null });
  });
  it('Undo writes exactly the earlier status back', () => {
    expect(undoStatus({ was: 'writing' })).toBe('writing');
    expect(undoStatus({ was: 'not_started' })).toBe('not_started');
    expect(undoStatus({ was: 'done' })).toBe('done');
  });
});
