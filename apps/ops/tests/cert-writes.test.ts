// The Certifications page's live writes (components/certifications/cert-writes.ts) against a stand-in client: the
// approval guard on ticks, exactly one row back, "already exists" as saved, the time limit, and thrown errors.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  res: { data: [{ id: 'x' }], error: null } as { data: unknown; error: unknown },
  throws: false,
  calls: [] as { table: string; op: string; value?: unknown; filters: [string, string, unknown][]; select?: string; signal?: AbortSignal }[],
}));

vi.mock('@btx/data', () => ({
  getBrowserClient: () => ({
    from: (table: string) => {
      const mk = (op: string, value?: unknown) => {
        const call = { table, op, value, filters: [] as [string, string, unknown][] } as (typeof db.calls)[number];
        db.calls.push(call);
        const end = { abortSignal: (s: AbortSignal) => { call.signal = s; if (db.throws) throw new Error('net'); return Promise.resolve(db.res); } };
        const f = {
          eq: (c: string, v: unknown) => (call.filters.push(['eq', c, v]), f),
          neq: (c: string, v: unknown) => (call.filters.push(['neq', c, v]), f),
          select: (c: string) => ((call.select = c), end),
        };
        return f;
      };
      return { insert: (v: unknown) => mk('insert', v), update: (v: unknown) => mk('update', v) };
    },
  }),
}));

import { insertChecklist, insertIdea, insertTask, setStepStatus } from '@/components/certifications/cert-writes';

beforeEach(() => {
  db.res = { data: [{ id: 'x' }], error: null };
  db.throws = false;
  db.calls = [];
});

describe('setStepStatus', () => {
  it('updates one task, never an approval, asks for the row back, with a time limit', async () => {
    expect(await setStepStatus('t1', 'done')).toBe(true);
    const c = db.calls[0];
    expect(c).toMatchObject({ table: 'tasks', op: 'update', value: { status: 'done' }, select: 'id' });
    expect(c.filters).toEqual([
      ['eq', 'id', 't1'],
      ['neq', 'type', 'approval'],
    ]);
    expect(c.signal).toBeInstanceOf(AbortSignal);
  });
  it('zero rows (an approval or no right), an error or a throw is a failure', async () => {
    db.res = { data: [], error: null };
    expect(await setStepStatus('t1', 'done')).toBe(false);
    db.res = { data: null, error: { code: '42501' } };
    expect(await setStepStatus('t1', 'done')).toBe(false);
    db.throws = true;
    expect(await setStepStatus('t1', 'done')).toBe(false);
  });
});

describe('inserts', () => {
  it('send the browser id and the fields', async () => {
    expect(await insertIdea('i1', 'p1', 'PMP')).toBe(true);
    expect(await insertChecklist('c1', 'p1')).toBe(true);
    expect(await insertTask('t1', 'c1', 'Draft', 4)).toBe(true);
    expect(db.calls.map((c) => [c.table, c.value])).toEqual([
      ['certification_ideas', { id: 'i1', program_id: 'p1', name: 'PMP' }],
      ['checklists', { id: 'c1', title: 'Setup checklist', area: 'programs', program_id: 'p1' }],
      ['tasks', { id: 't1', title: 'Draft', area: 'programs', position: 4, checklist_id: 'c1' }],
    ]);
    expect(db.calls.every((c) => c.select === 'id' && c.signal instanceof AbortSignal)).toBe(true);
  });
  it('"already exists" counts as saved; other errors and throws do not', async () => {
    db.res = { data: null, error: { code: '23505' } };
    expect(await insertIdea('i1', 'p1', 'PMP')).toBe(true);
    db.res = { data: null, error: { code: '42501' } };
    expect(await insertTask('t1', 'c1', 'Draft', 1)).toBe(false);
    db.throws = true;
    expect(await insertChecklist('c1', 'p1')).toBe(false);
  });
});
