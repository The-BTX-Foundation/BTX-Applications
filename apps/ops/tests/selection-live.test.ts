// The Selection page in live mode (lib/selection-live.ts) with a stand-in reader: score rows are asked for with
// published = true and only for ranked applicants, an unpublished score never reaches the view, a failed read is a
// load error (never zeros) logged with the table and code only, and the role decides who may record or release.
import { describe, expect, it, vi } from 'vitest';
import { capsFor, loadLiveSelection, type SlReadOpts, type SlReader } from '@/lib/selection-live';
import type { Row } from '@/lib/selection-map';

const NOW = new Date('2026-11-25T00:05:00Z');

// Tables as the stand-in database holds them (including rows the page must never draw).
function tables(): Record<string, Row[]> {
  return {
    cycles: [{ id: 'c1', status: 'published', term: 'Fall 2026', award_name: 'BTX Legacy Scholarship', award_amount_cents: 250000, interview_start: '2026-11-10', interview_end: '2026-11-20', decision_date: '2026-11-30', decisions_released_at: null }],
    applications: [
      { id: 'p1', cycle_id: 'c1', status: 'submitted', applicant_code: 'APP-1', full_name: 'Ranked Person', terpmail: 'r@x.org' },
      { id: 'p2', cycle_id: 'c1', status: 'submitted', applicant_code: 'APP-2', full_name: 'Waiting Person', terpmail: 'w@x.org' },
    ],
    rubric_criteria: [{ id: 'q1', cycle_id: 'c1', key: 'community', name: 'Community and service', weight: 100, position: 1 }],
    calendar_events: [],
    scholarship_awards: [],
    staff_profiles: [
      { user_id: 's1', display_name: 'Dana Reed' },
      { user_id: 's2', display_name: 'Charlie Moss' },
      { user_id: 's3', display_name: 'Unpublished Scorer' },
    ],
    application_score_summary: [
      { application_id: 'p1', published_count: 2, combined_score: 4.4 },
      { application_id: 'p2', published_count: 1, combined_score: 3.3 },
    ],
    scores: [
      { id: 'x1', application_id: 'p1', scorer_id: 's1', criteria: { community: 4 }, weighted_score: 4.4, published: true },
      { id: 'x2', application_id: 'p1', scorer_id: 's2', criteria: { community: 5 }, weighted_score: 4.4, published: true },
      { id: 'x3', application_id: 'p1', scorer_id: 's3', criteria: { community: 1 }, weighted_score: 1.7, published: false },
      { id: 'x4', application_id: 'p2', scorer_id: 's3', criteria: { community: 2 }, weighted_score: 2.9, published: false },
    ],
    interview_summaries: [],
  };
}

type Call = { table: string; o?: SlReadOpts };

// A reader over `t` that records every call; `ignoreEq` returns rows without the eq filter (a careless database).
function reader(t: Record<string, Row[]>, opts: { fail?: string; ignoreEq?: string } = {}) {
  const calls: Call[] = [];
  const pick = async (table: string, o: SlReadOpts = {}) => {
    calls.push({ table, o });
    if (opts.fail === table) throw Object.assign(new Error('boom Ranked Person'), { code: '42501' });
    let rows = t[table] ?? [];
    if (opts.ignoreEq !== table) for (const [c, v] of Object.entries(o.eq ?? {})) rows = rows.filter((r) => r[c] === v);
    for (const [c, v] of Object.entries(o.in ?? {})) rows = rows.filter((r) => v.includes(r[c]));
    return o.limit ? rows.slice(0, o.limit) : rows;
  };
  const r: SlReader = { rows: (tb, _s, o) => pick(tb, o), all: (tb, _s, o) => pick(tb, o) };
  return { r, calls };
}

describe('loadLiveSelection', () => {
  it('asks for published scores only, and only for ranked applicants', async () => {
    const { r, calls } = reader(tables());
    const v = await loadLiveSelection(r, 'admin', NOW);
    const sc = calls.filter((c) => c.table === 'scores');
    expect(sc.length).toBeGreaterThan(0);
    for (const c of sc) {
      expect(c.o?.eq).toEqual({ published: true });
      expect(c.o?.in?.application_id).toEqual(['p1']);
    }
    expect(v.rows.map((x) => x.code)).toEqual(['APP-1']);
    expect(v.unscored.map((x) => x.code)).toEqual(['APP-2']);
  });

  it('never lets an unpublished score into the view, even when the database returns one', async () => {
    const { r } = reader(tables(), { ignoreEq: 'scores' });
    const v = await loadLiveSelection(r, 'admin', NOW);
    const json = JSON.stringify(v);
    expect(json).not.toContain('Unpublished Scorer');
    expect(json).not.toContain('1.7');
    expect(json).not.toContain('2.9');
    expect(json).not.toContain('3.3');
  });

  it('turns a failed read into the load error and logs only the table and code', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { r } = reader(tables(), { fail: 'application_score_summary' });
    const v = await loadLiveSelection(r, 'admin', NOW);
    expect(v.loadFailed).toBe(true);
    expect(v.rows).toEqual([]);
    expect(v.cycle).toBeNull();
    expect(err).toHaveBeenCalledTimes(1);
    expect(err).toHaveBeenCalledWith('[selection] read failed', { table: 'application_score_summary', code: '42501' });
    expect(JSON.stringify(err.mock.calls)).not.toContain('Ranked Person');
    err.mockRestore();
  });

  it('asks for id lists 100 at a time', async () => {
    const t = tables();
    t.applications = Array.from({ length: 230 }, (_, i) => ({ id: `p${i}`, cycle_id: 'c1', status: 'submitted', applicant_code: `APP-${i}`, full_name: `P ${i}` }));
    const { r, calls } = reader(t);
    await loadLiveSelection(r, 'board', NOW);
    const sizes = calls.filter((c) => c.table === 'application_score_summary').map((c) => c.o?.in?.application_id?.length);
    expect(sizes).toEqual([100, 100, 30]);
  });

  it('ends every growing read on a unique key', async () => {
    const { r, calls } = reader(tables());
    await loadLiveSelection(r, 'admin', NOW);
    for (const c of calls) {
      const last = c.o?.order?.at(-1)?.[0];
      expect(['id', 'user_id', 'application_id']).toContain(last);
    }
  });

  it('shows the meeting only when a calendar row exists', async () => {
    const t = tables();
    expect((await loadLiveSelection(reader(t).r, 'admin', NOW)).meeting).toBeNull();
    t.calendar_events = [{ id: 'e1', cycle_id: 'c1', kind: 'selection_meeting', starts_at: '2026-11-25T00:00:00Z', video_url: null }];
    expect((await loadLiveSelection(reader(t).r, 'admin', NOW)).meeting?.startsAt).toBe('2026-11-25T00:00:00Z');
  });

  it('takes the next upcoming meeting over an old one', async () => {
    const t = tables();
    t.calendar_events = [
      { id: 'e0', cycle_id: 'c1', kind: 'selection_meeting', starts_at: '2026-04-01T23:00:00Z', video_url: null },
      { id: 'e1', cycle_id: 'c1', kind: 'selection_meeting', starts_at: '2026-11-26T00:00:00Z', video_url: 'https://teams.example/x' },
    ];
    const v = await loadLiveSelection(reader(t).r, 'admin', NOW);
    expect(v.meeting).toEqual({ startsAt: '2026-11-26T00:00:00Z', videoUrl: 'https://teams.example/x' });
  });
});

describe('capsFor', () => {
  it('lets only admins release', () => {
    expect(capsFor('admin')).toEqual({ record: true, undo: true, release: true });
    expect(capsFor('board')).toEqual({ record: true, undo: true, release: false });
    expect(capsFor('staff')).toEqual({ record: false, undo: false, release: false });
    expect(capsFor('')).toEqual({ record: false, undo: false, release: false });
  });
});
