// The Selection page's pure logic (lib/selection-map.ts): who is ranked (both scores published, never an unpublished
// pick), the phase, the news card, the release counts (kept equal to lib/release-copy.ts), Undo, the extra-award form,
// local changes over the server's awards, paging and id chunks.
import { describe, expect, it } from 'vitest';
import {
  NO_OVER,
  UNDO_RULE,
  canUndo,
  checkExtraForm,
  chunked,
  dropOver,
  mapRanking,
  newsFor,
  pageRows,
  phaseOf,
  releasePartsMatch,
  withOver,
  type Row,
} from '@/lib/selection-map';
import type { SlAward, SlCrit } from '@/lib/selection-view';
import { SL_VIEW_EMPTY, SL_VIEW_MEETING, SL_VIEW_TODAY } from '@/mock/selection-view';

const crit: SlCrit[] = [
  { key: 'community', short: 'Community', weight: 50 },
  { key: 'passion', short: 'Passion', weight: 50 },
];
const apps: Row[] = [
  { id: 'a1', applicant_code: 'APP-1', full_name: 'Ranked Person', terpmail: 'r@x.org' },
  { id: 'a2', applicant_code: 'APP-2', full_name: 'Half Published', terpmail: 'h@x.org' },
  { id: 'a3', applicant_code: 'APP-3', full_name: 'Hidden Row', terpmail: 'z@x.org' },
];
const staff: Row[] = [
  { user_id: 's1', display_name: 'Dana Reed' },
  { user_id: 's2', display_name: 'Charlie Moss' },
  { user_id: 's3', display_name: 'Secret Scorer' },
];

describe('mapRanking', () => {
  const r = mapRanking({
    apps,
    crit,
    staff,
    notes: [],
    summary: [
      { application_id: 'a1', published_count: 2, combined_score: 4.5 },
      { application_id: 'a2', published_count: 1, combined_score: 4.9 },
      // The view says two are published, but only one published row is readable: not ranked.
      { application_id: 'a3', published_count: 2, combined_score: 3.9 },
    ],
    scores: [
      { application_id: 'a1', scorer_id: 's1', criteria: { community: 4, passion: 5 }, weighted_score: 4.5, published: true },
      { application_id: 'a1', scorer_id: 's2', criteria: { community: 5, passion: 4 }, weighted_score: 4.5, published: true },
      // Unpublished: must never be read into the page, even when it sorts first.
      { application_id: 'a1', scorer_id: 's3', criteria: { community: 1, passion: 1 }, weighted_score: 1.1, published: false },
      { application_id: 'a2', scorer_id: 's3', criteria: { community: 2, passion: 2 }, weighted_score: 2.2, published: false },
      { application_id: 'a3', scorer_id: 's1', criteria: { community: 4, passion: 4 }, weighted_score: 4, published: true },
    ],
  });

  it('ranks only applicants with both scores published', () => {
    expect(r.rows.map((x) => x.code)).toEqual(['APP-1']);
    expect(r.unscored.map((x) => [x.code, x.why])).toEqual([
      ['APP-2', 'Not scored yet'],
      ['APP-3', 'Not scored yet'],
    ]);
  });

  it('never carries an unpublished score, pick or scorer', () => {
    const json = JSON.stringify(r);
    expect(json).not.toContain('Secret');
    expect(json).not.toContain('1.1');
    expect(json).not.toContain('2.2');
    expect(r.rows[0].pair.map((p) => p.name)).toEqual(['Charlie Moss', 'Dana Reed']);
    expect(r.rows[0].picks).toEqual([
      [5, 4],
      [4, 5],
    ]);
  });
});

describe('phaseOf and newsFor', () => {
  it('reads the phase from the data', () => {
    expect(phaseOf(SL_VIEW_EMPTY)).toBe('empty');
    expect(phaseOf(SL_VIEW_TODAY)).toBe('pre');
    expect(phaseOf(SL_VIEW_MEETING)).toBe('meeting');
    expect(phaseOf(SL_VIEW_TODAY, '2026-11-25T00:00:00Z')).toBe('meeting');
  });

  const main: SlAward = { id: 'm', applicationId: 'a1', code: 'APP-1', name: 'Ada Okafor', kind: 'main', awardName: 'Legacy', amountCents: 250000, decidedAt: null, letterDone: false };
  const base = { phase: 'meeting' as const, cycle: SL_VIEW_MEETING.cycle, releasedAt: null, emailsKicker: null };

  it('offers Release only to someone who may release', () => {
    expect(newsFor({ ...base, main, canRecord: true, canRelease: true })?.go).toBe('release');
    const board = newsFor({ ...base, main, canRecord: true, canRelease: false });
    expect(board?.go).toBeNull();
    expect(board?.title).toBe('An admin releases decisions');
  });

  it('offers Choose only to someone who may record', () => {
    expect(newsFor({ ...base, main: undefined, canRecord: true, canRelease: false })?.go).toBe('choose');
    expect(newsFor({ ...base, main: undefined, canRecord: false, canRelease: false })?.go).toBeNull();
  });

  it('says nothing before the meeting', () => {
    expect(newsFor({ ...base, phase: 'pre', main: undefined, canRecord: true, canRelease: true })).toBeNull();
  });
});

describe('release counts', () => {
  it.each([
    { total: 21, mainName: 'Legacy', extras: 0, recorded: 1 },
    { total: 21, mainName: 'Legacy', extras: 1, recorded: 2 },
    { total: 18, mainName: 'Think Big', extras: 2, recorded: 3 },
    { total: 1, mainName: 'Legacy', extras: 0, recorded: 1 },
  ])('match lib/release-copy.ts (%o)', (i) => {
    expect(releasePartsMatch(i)).toBe(true);
  });
});

describe('canUndo', () => {
  const a: SlAward = { id: 'x', applicationId: 'a', code: 'C', name: 'N', kind: 'extra', awardName: 'E', amountCents: 1, decidedAt: null, letterDone: false };
  it('follows the real rule: until the letter goes out or decisions are released', () => {
    expect(canUndo(a, null, true)).toBe(true);
    expect(canUndo({ ...a, letterDone: true }, null, true)).toBe(false);
    expect(canUndo(a, '2026-11-25T00:00:00Z', true)).toBe(false);
    expect(canUndo(a, null, false)).toBe(false);
    expect(UNDO_RULE).toContain('until the award letter goes out or decisions are released');
    expect(UNDO_RULE).not.toMatch(/can.t be undone/);
  });
});

describe('checkExtraForm', () => {
  it('checks name, then amount, then who', () => {
    expect(checkExtraForm({ name: '', amt: '', who: '' }).ok).toBe(false);
    const noAmt = checkExtraForm({ name: 'Empowerment', amt: '', who: '' });
    const noWho = checkExtraForm({ name: 'Empowerment', amt: '$500', who: '' });
    expect(noAmt.ok || noAmt.message).not.toBe(noWho.ok || noWho.message);
    expect(noWho).toEqual({ ok: false, message: 'Choose who gets it.' });
    expect(checkExtraForm({ name: ' Empowerment ', amt: '$500', who: 'a1' })).toEqual({ ok: true, awardName: 'Empowerment', cents: 50000 });
  });
});

describe('local award changes', () => {
  const s: SlAward = { id: 's', applicationId: 'a', code: 'C', name: 'N', kind: 'extra', awardName: 'E', amountCents: 1, decidedAt: null, letterDone: false };
  const m: SlAward = { ...s, id: 'm', kind: 'main' };
  it('adds, removes and drops a failed change', () => {
    expect(withOver([s], NO_OVER)).toEqual([s]);
    expect(withOver([s], { added: [m], removed: [] }).map((a) => a.id)).toEqual(['m', 's']);
    expect(withOver([s], { added: [], removed: ['s'] })).toEqual([]);
    expect(dropOver({ added: [m], removed: ['s'] }, 's')).toEqual({ added: [m], removed: [] });
    expect(dropOver({ added: [m], removed: [] }, 'm')).toEqual(NO_OVER);
  });
});

describe('paging', () => {
  it('stops only on an empty page and fails past the ceiling', async () => {
    const data = Array.from({ length: 25 }, (_, i) => i);
    const asked: number[] = [];
    const out = await pageRows(async (from, to) => (asked.push(from), data.slice(from, to + 1)), 10, 5);
    expect(out).toEqual(data);
    expect(asked).toEqual([0, 10, 20, 25]);
    await expect(pageRows(async () => [1], 1, 3)).rejects.toThrow();
  });

  it('chunks id lists by 100', () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id${i}`);
    expect(chunked(ids).map((c) => c.length)).toEqual([100, 100, 50]);
  });
});
