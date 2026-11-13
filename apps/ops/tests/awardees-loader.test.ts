// The Awardees loader's mock flags (lib/awardees-view-loader.ts awMockView): each `?demo=` draws its state.
import { describe, expect, it } from 'vitest';
import { awMockView } from '@/lib/awardees-view-loader';

describe('awMockView', () => {
  it('draws before the award by default', () => {
    const v = awMockView();
    if (v.failed) throw new Error('failed');
    expect(v.today).toBe('2026-11-10');
    expect(v.awards).toEqual([]);
    expect(v.past).toHaveLength(14);
    expect(v.caps.remindEmail).toBe(true);
  });
  it('draws after the award, stress, empty', () => {
    const after = awMockView('after');
    const stress = awMockView('stress');
    const empty = awMockView('empty');
    if (after.failed || stress.failed || empty.failed) throw new Error('failed');
    expect(after.awards.map((a) => a.name)).toEqual(['Jalen Thomas', 'Renee Simmons']);
    expect(stress.awards[0].name).toBe('Adaeze-Grace Nwachukwu-Bello');
    expect(empty.awards).toEqual([]);
    expect(empty.past).toEqual([]);
  });
  it('draws the error states and the failing save', () => {
    expect(awMockView('failed')).toEqual({ failed: true });
    const err = awMockView('error');
    const past = awMockView('pasterror');
    const save = awMockView('failsave');
    if (err.failed || past.failed || save.failed) throw new Error('failed');
    expect(err.loadFailed).toBe(true);
    expect(past.pastFailed).toBe(true);
    expect(past.loadFailed).toBe(false);
    expect(save.failFirst).toBe(true);
    expect(save.awards).toHaveLength(2);
  });
});
