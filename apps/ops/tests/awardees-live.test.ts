// Live Awardees loading (lib/awardees-live.ts) against a stand-in reader: the published cycle, its meeting, the term's
// awards (paged) and only their applications (100 ids at a time, this cycle, submitted); a failed core read is the page's
// designed load error (never an empty list), a failed past read fails only that section, and what the page may write
// follows the role. No email is ever possible.
import { describe, expect, it } from 'vitest';
import type { Row } from '@/lib/awardees-map';
import { loadLiveAwardees, type AwReadOpts, type AwReader } from '@/lib/awardees-live';

const NOW = new Date('2026-12-03T15:00:00Z');

// A reader over in-memory tables; `fail` names tables whose read throws. Records every read and how it was made.
function reader(tables: Record<string, Row[]>, fail: string[] = []) {
  const calls: { how: 'rows' | 'all'; table: string; o: AwReadOpts }[] = [];
  const pick = (how: 'rows' | 'all', table: string, o: AwReadOpts = {}) => {
    calls.push({ how, table, o });
    if (fail.includes(table)) throw new Error('refused');
    let rows = tables[table] ?? [];
    for (const [c, v] of Object.entries(o.eq ?? {})) rows = rows.filter((r) => r[c] === v);
    for (const [c, v] of Object.entries(o.in ?? {})) rows = rows.filter((r) => v.includes(r[c]));
    return o.limit ? rows.slice(0, o.limit) : rows;
  };
  const r: AwReader = { rows: async (t, _s, o) => pick('rows', t, o), all: async (t, _s, o) => pick('all', t, o) };
  return { r, calls };
}

const CYCLE = { id: 'c1', status: 'published', term: 'Fall 2026', award_name: 'BTX Legacy Scholarship', award_amount_cents: 250000, decision_date: '2026-11-30', decisions_released_at: '2026-11-30T17:00:00Z' };
const tables = (): Record<string, Row[]> => ({
  cycles: [CYCLE],
  calendar_events: [{ cycle_id: 'c1', kind: 'selection_meeting', starts_at: '2026-11-25T00:00:00Z' }],
  scholarship_awards: [
    { id: 'a1', cycle_id: 'c1', kind: 'main', application_id: 'p1', award_name: 'BTX Legacy Scholarship', amount_cents: 250000, award_steps: [{ step: 1, done_at: '2026-11-30T17:00:00Z' }] },
    { id: 'a2', cycle_id: 'c1', kind: 'extra', application_id: 'p2', award_name: 'Empowerment', amount_cents: 50000, award_steps: [] },
    { id: 'x', kind: 'past', past_term: 'Spring 2025', award_name: 'Think Big', amount_cents: 100000, awardee_label: 'M.N.' },
  ],
  applications: [
    { id: 'p1', cycle_id: 'c1', status: 'submitted', applicant_code: 'APP-1', full_name: 'Jalen Thomas', terpmail: 'j@x.org' },
    { id: 'p2', cycle_id: 'c1', status: 'submitted', applicant_code: 'APP-2', full_name: 'Renee Simmons', terpmail: 'r@x.org' },
    { id: 'p3', cycle_id: 'c1', status: 'submitted', applicant_code: 'APP-3', full_name: 'Not an awardee', terpmail: 'n@x.org' },
  ],
});

describe('loadLiveAwardees', () => {
  it('reads the term, its awardees and the past', async () => {
    const { r } = reader(tables());
    const v = await loadLiveAwardees(r, 'admin', NOW);
    expect(v.today).toBe('2026-12-03');
    expect(v.loadFailed).toBe(false);
    expect(v.cycle).toMatchObject({ term: 'Fall 2026', mainAward: 'Legacy', meeting: 'Tue Nov 24, 7:00 PM', releasedAt: '2026-11-30T17:00:00Z' });
    expect(v.awards.map((a) => [a.name, a.award, a.kind])).toEqual([
      ['Jalen Thomas', 'Legacy', 'main'],
      ['Renee Simmons', 'Empowerment', 'extra'],
    ]);
    expect(v.past).toEqual([{ id: 'x', term: 'Spring 2025', award: 'Think Big', amountCents: 100000, label: 'M.N.', main: false }]);
    expect(v.awards.every((a) => a.comment === null)).toBe(true);
  });

  it('pages growing reads with a unique last sort key and reads only the awards’ applications', async () => {
    const { r, calls } = reader(tables());
    await loadLiveAwardees(r, 'admin', NOW);
    const awards = calls.find((c) => c.table === 'scholarship_awards' && c.o.eq?.cycle_id)!;
    expect(awards.how).toBe('all');
    expect(awards.o.order?.at(-1)).toEqual(['id', true]);
    expect(awards.o.in).toEqual({ kind: ['main', 'extra'] });
    const past = calls.find((c) => c.table === 'scholarship_awards' && c.o.eq?.kind === 'past')!;
    expect(past.how).toBe('all');
    expect(past.o.order?.at(-1)).toEqual(['id', true]);
    const apps = calls.filter((c) => c.table === 'applications');
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({ how: 'all', o: { eq: { cycle_id: 'c1', status: 'submitted' }, in: { id: ['p1', 'p2'] } } });
  });

  it('reads applications 100 ids at a time', async () => {
    const t = tables();
    t.scholarship_awards = Array.from({ length: 250 }, (_, i) => ({ id: `a${i}`, cycle_id: 'c1', kind: 'extra', application_id: `p${i}`, award_name: 'X', amount_cents: 1 }));
    const { r, calls } = reader(t);
    const v = await loadLiveAwardees(r, 'admin', NOW);
    expect(calls.filter((c) => c.table === 'applications').map((c) => c.o.in?.id.length)).toEqual([100, 100, 50]);
    expect(v.awards).toHaveLength(250);
  });

  it('shows the load error (never an empty list) when a core read fails', async () => {
    for (const t of ['cycles', 'calendar_events', 'applications']) {
      const { r } = reader(tables(), [t]);
      const v = await loadLiveAwardees(r, 'admin', NOW);
      expect(v.loadFailed, t).toBe(true);
      expect(v.caps).toEqual({ tick: false, undo: false, funds: false, remindEmail: false, recordReminder: false });
    }
  });

  it('fails only the past section when the past read fails', async () => {
    const t = tables();
    const { r } = reader(t);
    // A reader whose past read throws but whose term read works.
    const r2: AwReader = { rows: r.rows, all: async (table, s, o) => (o.eq?.kind === 'past' ? Promise.reject(new Error('no')) : r.all(table, s, o)) };
    const v = await loadLiveAwardees(r2, 'admin', NOW);
    expect(v.loadFailed).toBe(false);
    expect(v.pastFailed).toBe(true);
    expect(v.past).toEqual([]);
    expect(v.awards).toHaveLength(2);
  });

  it('has no cycle and no awards when nothing is published', async () => {
    const t = tables();
    t.cycles = [{ ...CYCLE, status: 'draft' }];
    const { r } = reader(t);
    const v = await loadLiveAwardees(r, 'admin', NOW);
    expect(v.cycle).toBeNull();
    expect(v.awards).toEqual([]);
    expect(v.loadFailed).toBe(false);
  });

  it('lets admins and board members tick, mark funds and record reminders; never email, never Undo', async () => {
    for (const role of ['admin', 'board']) {
      const v = await loadLiveAwardees(reader(tables()).r, role, NOW);
      expect(v.caps).toEqual({ tick: true, undo: false, funds: true, remindEmail: false, recordReminder: true });
    }
    const v = await loadLiveAwardees(reader(tables()).r, 'volunteer', NOW);
    expect(v.caps).toEqual({ tick: false, undo: false, funds: false, remindEmail: false, recordReminder: false });
  });
});
