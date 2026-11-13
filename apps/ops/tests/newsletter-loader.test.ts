// The Newsletter loader's mock flags (lib/newsletter-view-loader.ts): every demo state, and mock caps all on.
import { describe, expect, it, vi } from 'vitest';
vi.mock('@btx/data', () => ({ hasSupabaseEnv: () => false }));
import { loadNewsletterView, nlMockView } from '@/lib/newsletter-view-loader';

describe('nlMockView', () => {
  it('draws the normal sample with every mock control on', () => {
    const v = nlMockView();
    if (v.failed) throw new Error('failed');
    expect(v.sections).toHaveLength(5);
    expect(v.loadFailed).toBe(false);
    expect(v.failFirst).toBe(false);
    expect(v.caps).toEqual({ tick: true, undo: true, nudge: true, send: true, pastIssues: true });
    expect(v.sections.find((s) => s.pinned)?.id).toBe('n3');
  });
  it('maps each demo flag', () => {
    const stress = nlMockView('stress');
    const empty = nlMockView('empty');
    const error = nlMockView('error');
    const save = nlMockView('failsave');
    if (stress.failed || empty.failed || error.failed || save.failed) throw new Error('failed');
    expect(stress.facts.subscribers).toBe('0');
    expect(stress.sections[3].owner).toBeNull();
    expect(empty.sections).toEqual([]);
    expect(error.loadFailed).toBe(true);
    expect(save.failFirst).toBe(true);
    expect(nlMockView('failed')).toEqual({ failed: true });
  });
  it('uses the mock sample when there is no Supabase env', async () => {
    const v = await loadNewsletterView({ demo: 'empty', user: { id: 'u', role: 'admin' } }, false);
    expect(v.failed ? null : v.sections).toEqual([]);
  });
});
