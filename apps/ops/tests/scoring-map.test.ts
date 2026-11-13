// Blind scoring in the Scoring page's mapping (lib/scoring-map.ts): whatever the reader returns, the view model holds
// only the signed-in person's own picks; the other interviewer is a published yes/no; another person's published score
// counts toward the cycle average only once both scores on that application are published; the queue holds only the
// person's own interviews that have started.
import { describe, expect, it } from 'vitest';
import { cycleAverages, mapSheets, nextUp, ownScore, queueStatus, type ScLiveRows } from '@/lib/scoring-map';
import type { ScCriterion } from '@/lib/scoring-view';

const ME = 'u-me';
const OTHER = 'u-other';
const NOW = '2026-11-19T15:00:00Z';
const criteria: ScCriterion[] = [
  { key: 'community', name: 'Community', short: 'Community', weight: 50, avg: null, questions: [] },
  { key: 'passion', name: 'Passion', short: 'Passion', weight: 50, avg: null, questions: [] },
];

function rows(o: Partial<ScLiveRows> = {}): ScLiveRows {
  return {
    pairings: [
      { slot_id: 's1', interviewer_a: ME, interviewer_b: OTHER },
      { slot_id: 's2', interviewer_a: OTHER, interviewer_b: ME },
      { slot_id: 's3', interviewer_a: OTHER, interviewer_b: 'u-third' },
    ],
    bookings: [
      { application_id: 'a1', slot_id: 's1', interview_slots: { starts_at: '2026-11-18T15:00:00Z' } },
      { application_id: 'a2', slot_id: 's2', interview_slots: [{ starts_at: '2026-11-17T15:00:00Z' }] },
      { application_id: 'a3', slot_id: 's3', interview_slots: { starts_at: '2026-11-17T15:00:00Z' } },
      // Not started yet: not in the queue.
      { application_id: 'a4', slot_id: 's1', interview_slots: { starts_at: '2026-11-20T15:00:00Z' } },
    ],
    apps: ['a1', 'a2', 'a3', 'a4'].map((id) => ({ id, applicant_code: `APP-${id}`, full_name: `Applicant ${id}`, terpmail: `${id}@terpmail.umd.edu` })),
    scores: [
      { application_id: 'a1', scorer_id: ME, criteria: { community: 4 }, published: false, updated_at: '2026-11-19T14:00:00Z' },
      // Someone else's draft and published rows, even if a reader ever returned them, never reach the view.
      { application_id: 'a1', scorer_id: OTHER, criteria: { community: 1, passion: 1 }, published: false },
      { application_id: 'a2', scorer_id: OTHER, criteria: { community: 2, passion: 2 }, published: true },
    ],
    progress: [{ application_id: 'a2', scorer_id: OTHER, published: true }],
    notes: [{ application_id: 'a1', note: 'my note' }],
    summaries: [],
    staff: [
      { user_id: OTHER, display_name: 'Charlie Gaines' },
      { user_id: ME, display_name: 'Dana Mercer' },
    ],
    ...o,
  };
}

describe('mapSheets', () => {
  it('keeps only my own started interviews, oldest first', () => {
    const s = mapSheets(rows(), criteria, ME, NOW);
    expect(s.map((x) => x.applicationId)).toEqual(['a2', 'a1']);
  });

  it("never carries someone else's score, published or not", () => {
    const s = mapSheets(rows(), criteria, ME, NOW);
    const a1 = s.find((x) => x.applicationId === 'a1');
    const a2 = s.find((x) => x.applicationId === 'a2');
    expect(a1?.picks).toEqual({ community: 4 });
    expect(a2?.picks).toEqual({});
    // No value from the other rows anywhere in the view model.
    const json = JSON.stringify(s);
    expect(json).not.toMatch(/"passion":[12]/);
    expect(json).not.toContain('"community":1');
    expect(json).not.toContain('"community":2');
  });

  it('shows the other interviewer only as published yes/no from score_progress', () => {
    const s = mapSheets(rows(), criteria, ME, NOW);
    expect(s.find((x) => x.applicationId === 'a2')).toMatchObject({ otherName: 'Charlie Gaines', otherPublished: true });
    expect(s.find((x) => x.applicationId === 'a1')).toMatchObject({ otherName: 'Charlie Gaines', otherPublished: false });
  });

  it('carries my own note only and a draft time only for a draft', () => {
    const s = mapSheets(rows(), criteria, ME, NOW);
    const a1 = s.find((x) => x.applicationId === 'a1');
    expect(a1?.note).toBe('my note');
    expect(a1?.savedAt).toBe('2026-11-19T14:00:00Z');
    expect(a1?.publishedAt).toBeNull();
    expect(s.find((x) => x.applicationId === 'a2')?.note).toBe('');
  });

  it('marks a published score locked with its time', () => {
    const s = mapSheets(
      rows({ scores: [{ application_id: 'a1', scorer_id: ME, criteria: { community: 4, passion: 5 }, published: true, published_at: '2026-11-18T20:00:00Z', updated_at: 'x' }] }),
      criteria,
      ME,
      NOW,
    );
    const a1 = s.find((x) => x.applicationId === 'a1');
    expect(a1).toMatchObject({ published: true, publishedAt: '2026-11-18T20:00:00Z', savedAt: null });
    expect(queueStatus(a1!, criteria)).toMatch(/Published/);
  });

  it('drops bad pick values', () => {
    const s = mapSheets(rows({ scores: [{ application_id: 'a1', scorer_id: ME, criteria: { community: 9, passion: 'x' }, published: false }] }), criteria, ME, NOW);
    expect(s.find((x) => x.applicationId === 'a1')?.picks).toEqual({});
  });
});

describe('cycleAverages (release only when both published)', () => {
  const keys = ['community', 'passion'];
  it("counts my own published score, and someone else's only once two are published on that application", () => {
    const scores = [
      { application_id: 'a1', scorer_id: ME, criteria: { community: 4, passion: 4 }, published: true },
      // One published on a2 so far: not released, not counted.
      { application_id: 'a2', scorer_id: OTHER, criteria: { community: 1, passion: 1 }, published: true },
      // Both published on a3: released, counted.
      { application_id: 'a3', scorer_id: OTHER, criteria: { community: 2, passion: 2 }, published: true },
      // A draft never counts.
      { application_id: 'a3', scorer_id: 'u-third', criteria: { community: 5, passion: 5 }, published: false },
    ];
    const progress = [
      { application_id: 'a1', scorer_id: ME, published: true },
      { application_id: 'a2', scorer_id: OTHER, published: true },
      { application_id: 'a3', scorer_id: OTHER, published: true },
      { application_id: 'a3', scorer_id: 'u-third', published: true },
    ];
    expect(cycleAverages(keys, scores, progress, ME)).toEqual({ community: '3.0', passion: '3.0' });
  });

  it('gives no average when nothing is released', () => {
    expect(cycleAverages(keys, [{ application_id: 'a2', scorer_id: OTHER, criteria: { community: 1 }, published: true }], [], ME)).toEqual({ community: null, passion: null });
  });
});

describe('the score and the next one up', () => {
  it('uses the shared weighted score of my own picks', () => {
    expect(ownScore({ picks: { community: 4, passion: 2 } }, criteria)).toBe('3.0');
  });
  it('points at the sheet already started, else the first unpublished one', () => {
    const s = mapSheets(rows(), criteria, ME, NOW);
    expect(nextUp(s, criteria, '2026-11-22')).toMatchObject({ sheet: { applicationId: 'a1' }, go: 'Continue', kicker: '2 to score · due Sun Nov 22' });
    expect(nextUp(s.map((x) => ({ ...x, picks: {} })), criteria, null)?.sheet.applicationId).toBe('a2');
    expect(nextUp(s.map((x) => ({ ...x, published: true })), criteria, null)).toBeNull();
  });
});
