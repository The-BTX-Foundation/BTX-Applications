// The Selection page's live writes (components/selection/selection-writes.ts): record and undo settle into saved,
// refused, failed or unknown; releaseAndNotify (it emails every applicant) is called at most once per page visit, never
// twice from one click, never retried after a failure or a timeout.
import { describe, expect, it, vi } from 'vitest';
import { DECISION_NOTE, guarded, newGuard, runRelease, writeRecord, writeUndo, type SlActions } from '@/components/selection/selection-writes';

const OUT = { state: 'sent' as const, sent: 3, skipped: 0, failed: 0 };
const input = { cycleId: 'c1', applicationId: 'p1', code: 'APP-1', name: 'A', kind: 'main' as const, awardName: 'BTX Legacy Scholarship', amountCents: 250000 };

// Stand-in actions; each test overrides what it needs.
function acts(over: Partial<SlActions> = {}): SlActions {
  return {
    recordAward: vi.fn(async () => ({ ok: true, message: '', id: 'new' })),
    undoAward: vi.fn(async () => ({ ok: true, message: '' })),
    releaseAndNotify: vi.fn(async () => ({ ok: true as const, releasedAt: '2026-11-25T01:00:00Z', already: false, emails: OUT })),
    ...over,
  };
}

describe('writeRecord and writeUndo', () => {
  it('passes the old page note and settles each way', async () => {
    const a = acts();
    expect(await writeRecord(a, input)).toEqual({ kind: 'saved', id: 'new' });
    expect(a.recordAward).toHaveBeenCalledWith({ ...input, note: DECISION_NOTE });
    expect(await writeRecord(acts({ recordAward: async () => ({ ok: false, message: 'No.' }) }), input)).toEqual({ kind: 'refused', message: 'No.' });
    expect(await writeRecord(acts({ recordAward: async () => Promise.reject(new Error('x')) }), input)).toEqual({ kind: 'failed' });
    expect(await writeUndo(acts({ undoAward: () => new Promise(() => {}) }), 'a1', 10)).toEqual({ kind: 'unknown' });
  });
});

describe('guarded', () => {
  it('refuses a second write while one is in flight', async () => {
    const g = newGuard();
    let done = () => {};
    const slow = vi.fn(() => new Promise<string>((res) => (done = () => res('ok'))));
    const first = guarded(g, false, slow);
    expect(g.inFlight).toBe(true);
    expect(await guarded(g, false, slow)).toBeNull();
    done();
    expect(await first).toBe('ok');
    expect(slow).toHaveBeenCalledTimes(1);
    expect(await guarded(g, false, async () => 'again')).toBe('again');
  });
});

describe('runRelease', () => {
  it('calls the action once even when asked twice at the same time', async () => {
    const a = acts();
    const g = newGuard();
    const [x, y] = await Promise.all([runRelease(a, 'c1', g), runRelease(a, 'c1', g)]);
    expect(a.releaseAndNotify).toHaveBeenCalledTimes(1);
    expect([x.kind, y.kind].sort()).toEqual(['busy', 'released']);
  });

  it('never calls again after a refusal, an error or a timeout', async () => {
    for (const fn of [async () => ({ ok: false as const, message: 'Only admins.' }), async () => Promise.reject(new Error('net')), () => new Promise<never>(() => {})]) {
      const spy = vi.fn(fn);
      const g = newGuard();
      const a = acts({ releaseAndNotify: spy as SlActions['releaseAndNotify'] });
      const first = await runRelease(a, 'c1', g, 10);
      expect(['refused', 'unknown']).toContain(first.kind);
      expect((await runRelease(a, 'c1', g, 10)).kind).toBe('busy');
      expect(spy).toHaveBeenCalledTimes(1);
    }
  });

  it('reports the emails line data when it worked', async () => {
    const r = await runRelease(acts(), 'c1', newGuard());
    expect(r).toEqual({ kind: 'released', releasedAt: '2026-11-25T01:00:00Z', already: false, emails: OUT });
  });
});
