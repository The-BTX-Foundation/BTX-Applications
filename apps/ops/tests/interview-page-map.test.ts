// The page for one interview, pure parts (lib/interview-page-map.ts): who may read the link and the notes, the caps, the
// questions' order and numbering, the split of notes into "mine" and other people's, and the Scoring page's grouping.
import { describe, expect, it } from 'vitest';
import { canReadNotes, capsFor, initialsFrom, mapInterviewPage, minutesOf, notesForScoring, questionGroups, splitNotes, type IpRows } from '@/lib/interview-page-map';
import { OVERALL } from '@/lib/interview-page-view';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const SLOT = '44444444-4444-4444-8444-444444444444';
const Q1 = '55555555-5555-4555-8555-555555555551';
const Q2 = '55555555-5555-4555-8555-555555555552';

const rubric = [
  { key: 'goals', name: 'Goals', weight: 50, position: 2 },
  { key: 'need', name: 'Need', weight: 50, position: 1 },
];
const questions = [
  { id: Q1, criterion_key: 'goals', position: 1, text: 'Where do you see yourself?', created_at: '2026-11-01T00:00:00Z' },
  { id: Q2, criterion_key: 'need', position: 1, text: 'How will the award help?', created_at: '2026-11-01T00:00:00Z' },
];
const staff = [
  { user_id: A, display_name: 'Dana Mercer', initials: 'DM' },
  { user_id: B, display_name: 'Keith Dawson', initials: '' },
  { user_id: C, display_name: 'Camila Keane', initials: 'CK' },
];
const rows = (over: Partial<IpRows> = {}): IpRows => ({
  slot: { id: SLOT, starts_at: '2026-11-18T22:00:00Z', ends_at: '2026-11-18T22:30:00Z' },
  application: { id: 'app', applicant_code: 'APP-2026-00011', full_name: 'Ada Okafor' },
  pairing: { slot_id: SLOT, interviewer_a: A, interviewer_b: B, video_url: 'https://teams.microsoft.com/l/x' },
  cycle: { term: 'Fall 2026', award_name: 'Legacy Scholarship' },
  staff,
  rubric,
  questions,
  notes: [
    { question_id: Q1, author_id: A, body: 'mine on q1' },
    { question_id: Q1, author_id: B, body: 'keith on q1' },
    { question_id: null, author_id: B, body: 'keith overall' },
    { question_id: Q2, author_id: B, body: '   ' },
  ],
  ...over,
});

describe('initialsFrom / minutesOf', () => {
  it('takes first and last initials, two letters of a single name, ? for blank', () => {
    expect(initialsFrom('Dana Mercer')).toBe('DM');
    expect(initialsFrom('Adaeze Grace Bello')).toBe('AB');
    expect(initialsFrom('Cher')).toBe('CH');
    expect(initialsFrom('  ')).toBe('?');
  });
  it('gives the length in minutes, null when unknown or not positive', () => {
    expect(minutesOf('2026-11-18T22:00:00Z', '2026-11-18T22:30:00Z')).toBe(30);
    expect(minutesOf(null, '2026-11-18T22:30:00Z')).toBeNull();
    expect(minutesOf('2026-11-18T22:30:00Z', '2026-11-18T22:00:00Z')).toBeNull();
  });
});

describe('who may read and do what', () => {
  it('the two interviewers and admins read; others do not', () => {
    expect(canReadNotes(A, false, [A, B])).toBe(true);
    expect(canReadNotes(C, true, [A, B])).toBe(true);
    expect(canReadNotes(C, false, [A, B])).toBe(false);
    expect(canReadNotes(null, false, [A, B])).toBe(false);
  });
  it('change: admins with two on it; notes: readers whose read worked; score: interviewers only', () => {
    expect(capsFor(C, true, [A, B], false)).toEqual({ change: true, notes: true, score: false });
    expect(capsFor(C, true, [A], false).change).toBe(false);
    expect(capsFor(A, false, [A, B], false)).toEqual({ change: false, notes: true, score: true });
    expect(capsFor(A, false, [A, B], true).notes).toBe(false);
    expect(capsFor(C, false, [A, B], false)).toEqual({ change: false, notes: false, score: false });
  });
});

describe('questionGroups', () => {
  it('orders areas by rubric position, numbers the questions down the page, drops empty areas', () => {
    const g = questionGroups([...rubric, { key: 'extra', name: 'Extra', weight: 0, position: 3 }], questions);
    expect(g.map((x) => x.name)).toEqual(['Need', 'Goals']);
    expect(g.flatMap((x) => x.questions.map((q) => [q.n, q.id]))).toEqual([
      [1, Q2],
      [2, Q1],
    ]);
  });
});

describe('splitNotes', () => {
  const names = new Map(staff.map((s) => [s.user_id, s.display_name]));
  const ids = new Set([Q1, Q2]);
  it('own words by box (blank kept), other people non-empty only, sorted by name', () => {
    const r = splitNotes(rows().notes!, A, true, ids, names);
    expect(r.mine).toEqual({ [Q1]: 'mine on q1' });
    expect(r.others[Q1]).toEqual([{ authorId: B, name: 'Keith Dawson', body: 'keith on q1' }]);
    expect(r.others[OVERALL]).toEqual([{ authorId: B, name: 'Keith Dawson', body: 'keith overall' }]);
    expect(r.others[Q2]).toBeUndefined();
  });
  it('keeps no one else when the viewer may not read, and drops notes on questions no longer listed', () => {
    expect(splitNotes(rows().notes!, A, false, ids, names).others).toEqual({});
    const gone = splitNotes([{ question_id: 'old', author_id: A, body: 'x' }], A, true, ids, names);
    expect(gone).toEqual({ mine: {}, others: {} });
  });
});

describe('mapInterviewPage', () => {
  it('maps an interviewer view: link shown, You marked, award, groups and notes', () => {
    const v = mapInterviewPage(rows(), A, false);
    expect(v.name).toBe('Ada Okafor');
    expect(v.award).toBe('Fall 2026 Legacy Scholarship');
    expect(v.pair.map((p) => [p.name, p.initials, p.me])).toEqual([
      ['Dana Mercer', 'DM', true],
      ['Keith Dawson', 'KD', false],
    ]);
    expect(v.link).toBe('https://teams.microsoft.com/l/x');
    expect(v.linkHidden).toBe(false);
    expect(v.mine[Q1]).toBe('mine on q1');
    expect(v.caps).toEqual({ change: false, notes: true, score: true });
  });
  it('someone not on it and not admin: the link is hidden (only that it exists), no notes', () => {
    const v = mapInterviewPage(rows(), C, false);
    expect(v.link).toBeNull();
    expect(v.linkHidden).toBe(true);
    expect(v.mine).toEqual({});
    expect(v.others).toEqual({});
    expect(v.caps.notes).toBe(false);
  });
  it('a failed notes read is a failure, never empty notes; a failed questions read says so', () => {
    const v = mapInterviewPage(rows({ notes: null, questions: null }), A, false);
    expect(v.notesFailed).toBe(true);
    expect(v.caps.notes).toBe(false);
    expect(v.questionsFailed).toBe(true);
    expect(v.groups).toEqual([]);
  });
  it('nobody paired: no pair, no link, nothing to change; a blank name falls back to the code', () => {
    const v = mapInterviewPage(rows({ pairing: null, application: { applicant_code: 'APP-2026-00099', full_name: ' ' } }), C, true);
    expect(v.pair).toEqual([]);
    expect(v.link).toBeNull();
    expect(v.linkHidden).toBe(false);
    expect(v.caps.change).toBe(false);
    expect(v.name).toBe('APP-2026-00099');
  });
});

describe('notesForScoring', () => {
  it('groups by question in page order then Overall, You first, blanks dropped', () => {
    const names = new Map(staff.map((s) => [s.user_id, s.display_name]));
    const groups = questionGroups(rubric, questions);
    const out = notesForScoring(groups, [...rows().notes!, { question_id: Q2, author_id: A, body: 'mine q2' }], names, B);
    expect(out.map((x) => x.label)).toEqual(['1. How will the award help?', '2. Where do you see yourself?', 'Overall notes']);
    expect(out[0].notes).toEqual([{ name: 'Dana Mercer', body: 'mine q2' }]);
    expect(out[1].notes.map((n) => n.name)).toEqual(['You', 'Dana Mercer']);
    expect(out[2].notes).toEqual([{ name: 'You', body: 'keith overall' }]);
  });
});
