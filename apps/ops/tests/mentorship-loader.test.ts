// The Mentorship loader's mock flags (lib/mentorship-view-loader.ts msMockView).
import { describe, expect, it } from 'vitest';
import { msMockView } from '@/lib/mentorship-view-loader';

describe('msMockView', () => {
  it('normal is the sample with every demo behaviour on', () => {
    const v = msMockView();
    if (v.failed) throw new Error('failed');
    expect(v.steps).toHaveLength(5);
    expect(v.loadFailed).toBe(false);
    expect(v.chat.failed).toBe(false);
    expect(v.caps).toEqual({ tick: true, undo: true, share: true, send: true });
    expect(v.failFirst).toEqual({ save: false, send: false });
  });
  it('stress, empty, error, chaterror, failsave, failsend, failed', () => {
    const s = msMockView('stress');
    expect(!s.failed && s.steps[2].unassigned).toBe(true);
    expect(!msMockView('empty').failed && (msMockView('empty') as { steps: unknown[] }).steps).toEqual([]);
    expect(msMockView('error')).toMatchObject({ loadFailed: true });
    expect(msMockView('chaterror')).toMatchObject({ chat: { failed: true, title: 'Programs chat' } });
    expect(msMockView('failsave')).toMatchObject({ failFirst: { save: true, send: false } });
    expect(msMockView('failsend')).toMatchObject({ failFirst: { save: false, send: true } });
    expect(msMockView('failed')).toEqual({ failed: true });
  });
});
