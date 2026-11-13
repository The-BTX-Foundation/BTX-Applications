// The Mentorship step write (components/mentorship/mentorship-writes.ts): only the status, scoped to the step and its
// checklist, never an approval, a time limit, 'ok' only when exactly one row changed, and Undo's guarded form.
import { describe, expect, it, vi } from 'vitest';
vi.mock('@btx/data', () => ({ getBrowserClient: () => ({}) }));
import { setStepStatus, type MsDb, type MsFilter } from '@/components/mentorship/mentorship-writes';

// A stand-in client that records every filter and answers with `res` (or throws).
function fake(res: { data: { id: string }[] | null; error: unknown } | Error) {
  const seen = { table: '', update: {} as Record<string, unknown>, eq: [] as [string, string][], neq: [] as [string, string][], select: '', signal: null as AbortSignal | null };
  // The filter chain: each call records itself and returns the same chain.
  const filter: MsFilter = {
    eq: (c, v) => (seen.eq.push([c, v]), filter),
    neq: (c, v) => (seen.neq.push([c, v]), filter),
    select: (cols) => {
      seen.select = cols;
      return {
        abortSignal: (s) => {
          seen.signal = s;
          return res instanceof Error ? Promise.reject(res) : Promise.resolve(res);
        },
      };
    },
  };
  const db: MsDb = {
    from: (t) => {
      seen.table = t;
      return {
        update: (v) => {
          seen.update = v;
          return filter;
        },
      };
    },
  };
  return { db, seen };
}

const W = { id: 's1', checklistId: 'cl1' } as const;

describe('setStepStatus', () => {
  it('sends only the status, scoped to the step and its checklist, skips approvals, asks for the row back with a time limit', async () => {
    const { db, seen } = fake({ data: [{ id: 's1' }], error: null });
    expect(await setStepStatus({ ...W, status: 'done' }, db)).toBe('ok');
    expect(seen).toMatchObject({ table: 'tasks', update: { status: 'done' }, select: 'id' });
    expect(seen.eq).toEqual([
      ['id', 's1'],
      ['checklist_id', 'cl1'],
    ]);
    expect(seen.neq).toEqual([['type', 'approval']]);
    expect(seen.signal).toBeInstanceOf(AbortSignal);
  });
  it('zero rows (refused by row-level security, or an approval) is a failure', async () => {
    expect(await setStepStatus({ ...W, status: 'open' }, fake({ data: [], error: null }).db)).toBe('failed');
  });
  it('more than one row is a failure', async () => {
    expect(await setStepStatus({ ...W, status: 'open' }, fake({ data: [{ id: 'a' }, { id: 'b' }], error: null }).db)).toBe('failed');
  });
  it('an error or a throw (time limit) is a failure', async () => {
    expect(await setStepStatus({ ...W, status: 'in_progress' }, fake({ data: null, error: { message: 'no' } }).db)).toBe('failed');
    expect(await setStepStatus({ ...W, status: 'done' }, fake(new Error('aborted')).db)).toBe('failed');
  });
});

describe('setStepStatus, guarded (Undo)', () => {
  it('Undo of an in_progress step writes in_progress back, only while the row still holds done', async () => {
    const { db, seen } = fake({ data: [{ id: 's1' }], error: null });
    expect(await setStepStatus({ ...W, status: 'in_progress', expect: 'done' }, db)).toBe('ok');
    expect(seen.update).toEqual({ status: 'in_progress' });
    expect(seen.eq).toContainEqual(['status', 'done']);
    expect(seen.eq).toContainEqual(['checklist_id', 'cl1']);
  });
  it('Undo of a declined step writes declined back exactly', async () => {
    const { db, seen } = fake({ data: [{ id: 's1' }], error: null });
    expect(await setStepStatus({ ...W, status: 'declined', expect: 'done' }, db)).toBe('ok');
    expect(seen.update).toEqual({ status: 'declined' });
  });
  it('a guard miss (zero rows, no error) is "changed by someone else"; an error is still a failure', async () => {
    expect(await setStepStatus({ ...W, status: 'open', expect: 'done' }, fake({ data: [], error: null }).db)).toBe('changed');
    expect(await setStepStatus({ ...W, status: 'open', expect: 'done' }, fake({ data: null, error: { message: 'no' } }).db)).toBe('failed');
  });
});
