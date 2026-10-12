import { describe, expect, it } from 'vitest';
import { combinedLabels, fundsErrorMessage, scoreErrorMessage, shortAwardName, sortRanking, standing, upcomingLabel, weightedScore, type StandingInput } from '@/lib/sch-logic';

const RUBRIC = [
  { key: 'community', weight: 20 },
  { key: 'resilience', weight: 20 },
  { key: 'leadership', weight: 20 },
  { key: 'financial', weight: 20 },
  { key: 'communication', weight: 10 },
  { key: 'passion', weight: 10 },
];

describe('weightedScore', () => {
  it('weights the picks the way scores_check() does', () => {
    expect(weightedScore(RUBRIC, { community: 4, resilience: 4, leadership: 4, financial: 3, communication: 4, passion: 3 })).toBe(3.7);
    expect(weightedScore(RUBRIC, { community: 5, communication: 1 })).toBe(Math.round(((20 * 5 + 10 * 1) / 30) * 100) / 100);
  });
  it('is null with no picks, and ignores keys that are not on the rubric', () => {
    expect(weightedScore(RUBRIC, {})).toBeNull();
    expect(weightedScore(RUBRIC, { nope: 5 })).toBeNull();
  });
});

describe('error messages', () => {
  it('names the score errors from the database', () => {
    expect(scoreErrorMessage({ message: 'publish_needs_all_criteria' })).toMatch(/every criterion/);
    expect(scoreErrorMessage({ code: '42501', message: 'new row violates row-level security policy for table "scores"' })).toMatch(/only score an applicant you interviewed/);
    expect(scoreErrorMessage({ message: 'invalid_pick' })).toMatch(/not on the rubric/);
    expect(scoreErrorMessage(null)).toMatch(/didn't save/);
  });
  it('names the funds-sent errors from mark_award_funds_sent()', () => {
    expect(fundsErrorMessage({ message: 'no_scholarship_category:2026' })).toMatch(/2026 budget/);
    expect(fundsErrorMessage({ message: 'already_paid' })).toMatch(/already marked/);
    expect(fundsErrorMessage({ message: 'no_amount' })).toMatch(/no amount/);
    expect(fundsErrorMessage({ message: 'boom' })).toMatch(/didn't save/);
  });
});

describe('ranking labels', () => {
  it('prints one decimal, and two only where different scores would print the same', () => {
    expect(combinedLabels([4.8, 4.6, 4.5])).toEqual(['4.8', '4.6', '4.5']);
    expect(combinedLabels([4.83, 4.78, 4.5])).toEqual(['4.83', '4.78', '4.5']);
    expect(combinedLabels([4.8, 4.8, 4.3])).toEqual(['4.8', '4.8', '4.3']);
  });
  it('sorts best first, ties by code', () => {
    const r = sortRanking([
      { code: 'B', combined: 4.1 },
      { code: 'C', combined: 4.8 },
      { code: 'A', combined: 4.1 },
    ]);
    expect(r.map((x) => x.code)).toEqual(['C', 'A', 'B']);
  });
  it('shortens award names', () => {
    expect(shortAwardName('Legacy Scholarship')).toBe('Legacy');
    expect(shortAwardName('BTX Think Big Award')).toBe('Think Big');
  });
});

describe('standing', () => {
  const now = new Date('2026-10-12T16:00:00Z');
  const me = { id: 'me', name: 'Test Admin', initials: 'TA' };
  const other = { id: 'ot', name: 'Test Board Member', initials: 'TB' };
  const base: StandingInput = {
    now,
    interviewAt: '2026-10-10T14:00:00Z',
    pair: [me, other],
    meId: 'me',
    mine: null,
    progress: [],
    released: null,
    interviewSummary: null,
    criteriaTotal: 6,
    selectionLabel: '',
    awardLabel: 'Mon Oct 19',
  };

  it('no booking: interview not booked', () => {
    const s = standing({ ...base, interviewAt: null, pair: [] });
    expect(s.stage).toEqual({ kind: 'none', label: 'Interview not booked' });
  });
  it('upcoming interview: names the day', () => {
    expect(standing({ ...base, interviewAt: '2026-10-13T14:00:00Z' }).stage).toEqual({ kind: 'interview', label: 'Interview tomorrow' });
    expect(upcomingLabel('2026-10-15T14:00:00Z', now)).toBe('Interview Thu');
    expect(upcomingLabel('2026-10-12T20:00:00Z', now)).toBe('Interview today');
  });
  it('my interview, nothing scored: needs my score', () => {
    const s = standing(base);
    expect(s.stage.kind).toBe('needs-score');
    expect(s.score).toEqual({ kind: 'none', line1: 'Not started' });
    expect(s.action).toBe('Start scoring');
    expect(s.names).toEqual(['Test Admin', 'Test Board Member']);
  });
  it('my draft: shows how many criteria are in', () => {
    const s = standing({ ...base, mine: { criteriaCount: 4, published: false, weighted: 3.5 }, progress: [{ scorerId: 'ot', published: true }] });
    expect(s.score).toEqual({ kind: 'draft', line1: 'Your draft', line2: '4 of 6' });
    expect(s.progress[2].note).toBe('1 of 2 published: Test published, your draft 4 of 6');
  });
  it('I published, the other has not: waiting on them, my score shown', () => {
    const s = standing({ ...base, mine: { criteriaCount: 6, published: true, weighted: 3.7 } });
    expect(s.stage).toEqual({ kind: 'waiting', label: 'Waiting on Test Board Member' });
    expect(s.score).toEqual({ kind: 'avg', line1: '3.7', line2: '1 of 2' });
  });
  it('both published: scored, combined score', () => {
    const s = standing({ ...base, released: { combined: 4.25 } });
    expect(s.group).toBe('scored');
    expect(s.score).toEqual({ kind: 'avg', line1: '4.3' });
  });
  it("someone else's interview: progress without values", () => {
    const a = { id: 'a', name: 'Ann Lee', initials: 'AL' };
    const b = { id: 'b', name: 'Bo Kim', initials: 'BK' };
    const s = standing({ ...base, pair: [a, b], progress: [{ scorerId: 'a', published: true }] });
    expect(s.stage).toEqual({ kind: 'waiting', label: 'Waiting on Bo Kim' });
    expect(s.score).toEqual({ kind: 'none', line1: '1 of 2 published' });
    // A reviewer may not see progress at all.
    expect(standing({ ...base, pair: [a, b], progress: null }).stage.label).toBe('Waiting on scores');
  });
  it('interview done but nobody paired', () => {
    expect(standing({ ...base, pair: [] }).stage.label).toBe('Interviewers not paired');
  });
});
