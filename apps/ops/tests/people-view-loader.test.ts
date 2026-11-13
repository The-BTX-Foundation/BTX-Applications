import { describe, expect, it, vi } from 'vitest';

vi.mock('@btx/data', () => ({ hasSupabaseEnv: () => false }));
vi.mock('@/lib/people-live', () => ({ loadLivePeopleView: vi.fn() }));

import { loadPeopleView } from '@/lib/people-view-loader';

describe('loadPeopleView (mock mode)', () => {
  it('normal: the sample, with the viewer and every person given work', async () => {
    const v = await loadPeopleView();
    if (v.failed) throw new Error('failed');
    expect(v.people).toHaveLength(8);
    expect(v.me).toBe('dm');
    expect(v.people.every((p) => v.work[p.id])).toBe(true);
    expect(v.loadFailed || v.workFailed).toBe(false);
  });
  it('stress adds the invited address and 120 open tasks', async () => {
    const v = await loadPeopleView({ demo: 'stress' });
    if (v.failed) throw new Error('failed');
    expect(v.people.at(-1)).toMatchObject({ lastDay: null, nameIsEmail: true });
    expect(v.work.ds.tasks.length + v.work.ds.more).toBe(120);
  });
  it('empty, error, uncounted, failed', async () => {
    const e = await loadPeopleView({ demo: 'empty' });
    expect(!e.failed && e.people.map((p) => p.id)).toEqual(['dm']);
    const er = await loadPeopleView({ demo: 'error' });
    expect(!er.failed && er.loadFailed).toBe(true);
    const u = await loadPeopleView({ demo: 'uncounted' });
    expect(!u.failed && u.workFailed).toBe(true);
    expect(await loadPeopleView({ demo: 'failed' })).toEqual({ failed: true });
  });
});
