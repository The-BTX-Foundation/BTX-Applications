// The Scoring loader in live mode (docs/DESIGN-DNA.md, "Mock-only demo flags"): with Supabase env present every ?demo=
// value is ignored and the page reads the real tables (here a stand-in reader), so no demo flag can fake a load error,
// switch on Undo or Nudge, or simulate a write live. Also: blind scoring holds whatever the reader returns, only the
// signed-in person's score and note rows are asked for, every in() filter is sent in chunks of 100, a failed core read
// is a load error (never an empty queue), and the server log carries the table and code only.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Row } from '@/lib/applicants-map';
import type { ApReader, ApReadOpts } from '@/lib/applicants-live';

const db = vi.hoisted(() => ({
  fail: null as null | { table: string; code: string },
  calls: [] as { table: string; select: string; o: ApReadOpts }[],
  many: 0,
}));

vi.mock('@btx/data', () => ({ hasSupabaseEnv: () => true }));

vi.mock('@/lib/applicants-db', () => {
  const ME = 'u-me';
  const OTHER = 'u-other';
  const tables = (): Record<string, Row[]> => {
    const extra = Array.from({ length: db.many }, (_, i) => `x${i}`);
    return {
      cycles: [{ id: 'c1', created_at: '2026-09-01' }],
      interview_pairings: [{ slot_id: 's1', interviewer_a: ME, interviewer_b: OTHER }],
      rubric_criteria: [
        { key: 'community', name: 'Community', weight: 50, position: 1 },
        { key: 'passion', name: 'Passion', weight: 50, position: 2 },
      ],
      staff_profiles: [{ user_id: OTHER, display_name: 'Charlie Gaines' }],
      bookings: [
        { application_id: 'a1', slot_id: 's1', interview_slots: { starts_at: '2026-11-10T15:00:00Z' } },
        ...extra.map((id) => ({ application_id: id, slot_id: 's1', interview_slots: { starts_at: '2026-11-10T16:00:00Z' } })),
      ],
      applications: [{ id: 'a1', applicant_code: 'APP-1', full_name: 'Ada Okafor', terpmail: 'ada@terpmail.umd.edu' }, ...extra.map((id) => ({ id, applicant_code: id, full_name: id, terpmail: null }))],
      // A reader that wrongly returned another person's rows must still not leak them.
      scores: [
        { application_id: 'a1', scorer_id: ME, criteria: { community: 4 }, published: false, updated_at: '2026-11-11T14:00:00Z' },
        { application_id: 'a1', scorer_id: OTHER, criteria: { community: 1, passion: 1 }, published: true },
      ],
      score_private_notes: [{ application_id: 'a1', note: 'mine' }],
      interview_summaries: [],
      interview_questions: [
        { cycle_id: 'c1', criterion_key: 'community', position: 1, text: 'This cycle: who helped you start?', id: 'q1' },
        { cycle_id: 'c0', criterion_key: 'community', position: 1, text: 'Last cycle: an old question', id: 'q0' },
      ],
    };
  };
  const sessionReader: ApReader = {
    all: async (table, select, o) => {
      db.calls.push({ table, select, o });
      if (db.fail?.table === table) throw { code: db.fail.code, message: 'Ada Okafor score 4 was refused' };
      const rows = tables()[table] ?? [];
      // The questions table filters like the database does, so a missing cycle filter shows up.
      if (table !== 'interview_questions') return rows;
      return rows.filter((r) => Object.entries(o.eq ?? {}).every(([k, v]) => r[k] === v));
    },
    rpc: async (fn) => {
      if (db.fail?.table === fn) throw { code: db.fail.code, message: 'refused' };
      return [{ application_id: 'a1', scorer_id: OTHER, published: true }];
    },
  };
  return { sessionReader };
});

afterEach(() => {
  db.fail = null;
  db.calls = [];
  db.many = 0;
  vi.restoreAllMocks();
});

describe('loadScoringView in live mode', () => {
  it.each(['failed', 'error', 'stress', 'empty', 'failsave', 'slowpublish', 'confirm', 'loading', undefined])('ignores ?demo=%s: real data, Undo and Nudge off, no simulation', async (demo) => {
    const { loadScoringView } = await import('@/lib/scoring-view-loader');
    const r = await loadScoringView({ demo, me: 'u-me' });
    expect(r.failed).toBe(false);
    if (r.failed) return;
    expect(r.sheets.map((s) => s.name)).toEqual(['Ada Okafor']);
    expect(r.caps).toEqual({ undoPublish: false, nudge: false });
    expect(r.sim).toBeNull();
  });

  it("never puts someone else's score in the view, and shows them as published only", async () => {
    const { loadScoringView } = await import('@/lib/scoring-view-loader');
    const r = await loadScoringView({ me: 'u-me' });
    if (r.failed) throw new Error('should load');
    expect(r.sheets[0]).toMatchObject({ picks: { community: 4 }, otherPublished: true, otherName: 'Charlie Gaines', note: 'mine' });
    expect(JSON.stringify(r)).not.toContain('"passion":1');
  });

  it('asks only for my own scores and my own notes', async () => {
    const { loadScoringView } = await import('@/lib/scoring-view-loader');
    await loadScoringView({ me: 'u-me' });
    const own = db.calls.filter((c) => c.table === 'scores' && !c.o.eq?.published);
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((c) => c.o.eq?.scorer_id === 'u-me')).toBe(true);
    const notes = db.calls.filter((c) => c.table === 'score_private_notes');
    expect(notes.every((c) => c.o.eq?.user_id === 'u-me')).toBe(true);
    // The other scores read (for the cycle average) asks for published rows only.
    expect(db.calls.filter((c) => c.table === 'scores' && c.o.eq?.published).every((c) => c.o.eq?.published === true)).toBe(true);
  });

  it('sends in() filters in chunks of 100 and orders every read', async () => {
    db.many = 230;
    const { loadScoringView } = await import('@/lib/scoring-view-loader');
    await loadScoringView({ me: 'u-me' });
    const apps = db.calls.filter((c) => c.table === 'applications');
    expect(apps.map((c) => Object.values(c.o.in ?? {})[0]?.length)).toEqual([100, 100, 31]);
    expect(db.calls.every((c) => c.o.order.length > 0)).toBe(true);
  });

  it.each(['scores', 'score_private_notes', 'rubric_criteria', 'interview_pairings', 'score_progress'])('a failed %s read is a load error, logged with the table and code only', async (table) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.fail = { table, code: '42501' };
    const { loadScoringView } = await import('@/lib/scoring-view-loader');
    const r = await loadScoringView({ me: 'u-me' });
    expect(r.failed).toBe(true);
    expect(log).toHaveBeenCalledWith('[scoring] read failed', { table, code: '42501' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('Ada');
  });

  it("lists only this cycle's interview questions", async () => {
    const { loadScoringView } = await import('@/lib/scoring-view-loader');
    const r = await loadScoringView({ me: 'u-me' });
    if (r.failed) throw new Error('should load');
    expect(r.criteria.find((c) => c.key === 'community')?.questions).toEqual(['This cycle: who helped you start?']);
    const q = db.calls.find((c) => c.table === 'interview_questions');
    expect(q?.o.eq).toEqual({ cycle_id: 'c1' });
  });

  it('a failed summaries read keeps the queue and says so in place', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.fail = { table: 'interview_summaries', code: 'PGRST301' };
    const { loadScoringView } = await import('@/lib/scoring-view-loader');
    const r = await loadScoringView({ me: 'u-me' });
    expect(r.failed === false && r.notesFailed).toBe(true);
    expect(r.failed === false && r.sheets.length).toBe(1);
    expect(log).toHaveBeenCalledWith('[scoring] read failed', { table: 'interview_summaries', code: 'PGRST301' });
  });
});
