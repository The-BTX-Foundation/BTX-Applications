// The Interview questions loader in live mode (docs/DESIGN-DNA.md, "Mock-only demo flags"): with Supabase env present,
// every ?demo= value is ignored and the page reads the real tables (here a stand-in reader), so no demo flag can switch a
// write on, fake a failure or fake a load error live. Mock mode honours each flag.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QnReader } from '@/lib/questions-live';

const db = vi.hoisted(() => ({ fail: null as null | { table: string; code: string } }));

vi.mock('@btx/data', () => ({ hasSupabaseEnv: () => true }));

vi.mock('@/lib/questions-db', () => {
  const boom = (table: string) => {
    if (db.fail?.table === table) throw { table, code: db.fail.code, message: 'Ada Okafor row was refused' };
  };
  const sessionQnReader: QnReader = {
    cycle: async () => (boom('cycles'), { id: 'cyc-1', term: 'Fall 2026' }),
    rubric: async () => (boom('rubric_criteria'), [{ key: 'community', name: 'Community engagement and values', weight: 20, position: 1 }]),
    questions: async () => (boom('interview_questions'), [{ id: 'q1', criterion_key: 'community', text: 'Real question', position: 1 }]),
    myPairings: async () => (boom('interview_pairings'), []),
    bookings: async () => [],
    applications: async () => [],
    staff: async () => [],
  };
  return { sessionQnReader };
});

afterEach(() => {
  db.fail = null;
  vi.restoreAllMocks();
});

const ME = '11111111-1111-4111-8111-111111111111';

describe('loadQnView in live mode', () => {
  it.each(['failed', 'error', 'empty', 'stress', 'board', 'nexterror', 'failsave', 'conflict', 'timeout', 'loading', undefined])('ignores ?demo=%s', async (demo) => {
    const { loadQnView } = await import('@/lib/questions-view-loader');
    const r = await loadQnView({ demo, me: ME, isAdmin: true });
    expect(r.failed).toBe(false);
    if (r.failed) return;
    expect(r.loadFailed).toBe(false);
    expect(r.nextFailed).toBe(false);
    expect(r.mockWrite).toBeNull();
    expect(r.cycleId).toBe('cyc-1');
    expect(r.groups.flatMap((g) => g.questions.map((q) => q.text))).toEqual(['Real question']);
    expect(r.caps.draftChip || r.caps.removeUndo || r.caps.starterUndo).toBe(false);
    expect(r.caps.edit).toBe(true);
  });

  it('gives a board member without admin rights no write, whatever the flag', async () => {
    const { loadQnView } = await import('@/lib/questions-view-loader');
    const r = await loadQnView({ demo: 'normal', me: ME, isAdmin: false });
    expect(r.failed === false && Object.values(r.caps).some(Boolean)).toBe(false);
  });

  it('a failed core read is a load error (never an empty list), logged with table and code only', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.fail = { table: 'interview_questions', code: '42501' };
    const { loadQnView } = await import('@/lib/questions-view-loader');
    const r = await loadQnView({ demo: 'stress', me: ME, isAdmin: true });
    expect(r.failed === false && r.loadFailed).toBe(true);
    expect(r.failed === false && Object.values(r.caps).some(Boolean)).toBe(false);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('[questions] read failed', { table: 'interview_questions', code: '42501' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('Ada');
  });

  it('a failed next-interview read marks only that panel', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.fail = { table: 'interview_pairings', code: 'PGRST301' };
    const { loadQnView } = await import('@/lib/questions-view-loader');
    const r = await loadQnView({ me: ME, isAdmin: true });
    expect(r.failed === false && r.nextFailed).toBe(true);
    expect(r.failed === false && r.loadFailed).toBe(false);
    expect(log).toHaveBeenCalledWith('[questions] read failed', { table: 'interview_pairings', code: 'PGRST301' });
  });
});

describe('mockQn', () => {
  it('honours each flag in mock mode', async () => {
    const { mockQn } = await import('@/lib/questions-view-loader');
    expect(mockQn('failed')).toEqual({ failed: true });
    const n = (d?: string) => {
      const r = mockQn(d);
      if (r.failed) throw new Error('failed');
      return r;
    };
    expect(n('error').loadFailed).toBe(true);
    expect(n('nexterror').nextFailed).toBe(true);
    expect(n('board').caps.edit).toBe(false);
    expect(n('empty').groups.every((g) => g.questions.length === 0)).toBe(true);
    expect(n('stress').groups.reduce((s, g) => s + g.questions.length, 0)).toBe(15);
    expect(n('conflict').mockWrite).toBe('conflict');
    expect(n().caps.draftChip).toBe(true);
  });
});
