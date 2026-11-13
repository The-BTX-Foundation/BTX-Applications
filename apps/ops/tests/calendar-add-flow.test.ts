import { describe, expect, it } from 'vitest';
import { createIdQueue, insertSaved, pickAddId, showSaveError, undoWorked, type AddRetry, type AddSig } from '@/lib/calendar-add-flow';
import { parseEvent } from '@/lib/calendar-time';

const sig = { title: 'Board call', day: '2026-11-12', time: 1140, area: 'scholarships' };

describe('add ids and retries', () => {
  it('reuses the failed add id only for the same add', () => {
    const retry = { sig, id: 'old' };
    expect(pickAddId(retry, { ...sig }, 'fresh')).toBe('old');
    expect(pickAddId(retry, { ...sig, time: null }, 'fresh')).toBe('fresh');
    expect(pickAddId(retry, { ...sig, title: 'Board call 2' }, 'fresh')).toBe('fresh');
    expect(pickAddId(null, sig, 'fresh')).toBe('fresh');
  });
  it('a retry restored with its chip choices reads the same add and reuses the id', () => {
    const T = '2026-11-10';
    const field = { text: 'Donor lunch fri 7pm', dismissed: { day: false, time: true }, areaPick: 'programs' as const };
    const sigOf = (f: typeof field | { text: string; dismissed: { day: boolean; time: boolean }; areaPick: null }): AddSig => {
      const p = parseEvent(f.text, T, f.dismissed, f.areaPick);
      return { title: p.title, day: p.day ?? T, time: p.time, area: p.area ?? 'scholarships' };
    };
    const first = sigOf(field);
    expect(first).toMatchObject({ area: 'programs', time: null, day: '2026-11-13' });
    const retry: AddRetry = { sig: first, id: 'id1', ...field };
    // Restored exactly (words + chips): same add, same id.
    expect(pickAddId(retry, sigOf({ text: retry.text, dismissed: retry.dismissed, areaPick: retry.areaPick as 'programs' }), 'fresh')).toBe('id1');
    // The words alone would read Finance at 7 PM: a different add, which is why the chips are kept.
    expect(pickAddId(retry, sigOf({ text: retry.text, dismissed: { day: false, time: false }, areaPick: null }), 'fresh')).toBe('fresh');
  });
  it('counts a duplicate key (23505, the same id again) as saved', () => {
    expect(insertSaved(null)).toBe(true);
    expect(insertSaved({ code: '23505', message: 'duplicate key' })).toBe(true);
    expect(insertSaved({ code: '42501' })).toBe(false);
    expect(insertSaved(new Error('timeout'))).toBe(false);
  });
});

describe('undo', () => {
  it('worked when the row went, or when nothing was saved and nothing was there', () => {
    expect(undoWorked(true, 1)).toBe(true);
    expect(undoWorked(false, 1)).toBe(true); // a timed-out insert that did save: deleted
    expect(undoWorked(false, 0)).toBe(true);
    expect(undoWorked(true, 0)).toBe(false); // saved, but the delete was refused
    expect(undoWorked(true, null)).toBe(false);
    expect(undoWorked(false, null)).toBe(false);
  });
  it('shows "Couldn\'t save" for a failed insert only when it was not undone', () => {
    expect(showSaveError(false, false)).toBe(true);
    expect(showSaveError(false, true)).toBe(false);
    expect(showSaveError(true, false)).toBe(false);
  });
});

describe('the per-id queue', () => {
  it('runs an Undo tapped while the insert is still running after the insert', async () => {
    const run = createIdQueue();
    const log: string[] = [];
    let finishInsert!: (ok: boolean) => void;
    const insert = run('a', () => new Promise<boolean>((r) => (finishInsert = (ok) => { log.push('insert'); r(ok); })));
    const del = run('a', async () => { log.push('delete'); return 1; });
    await Promise.resolve();
    expect(log).toEqual([]);
    finishInsert(false);
    expect(await insert).toBe(false);
    expect(await del).toBe(1);
    expect(log).toEqual(['insert', 'delete']);
  });
  it('still deletes after an insert that threw', async () => {
    const run = createIdQueue();
    const ins = run('a', async () => { throw new Error('timeout'); });
    const del = run('a', async () => 'deleted');
    await expect(ins).rejects.toThrow('timeout');
    expect(await del).toBe('deleted');
  });
  it('does not hold up other ids', async () => {
    const run = createIdQueue();
    const log: string[] = [];
    void run('a', () => new Promise(() => undefined));
    await run('b', async () => log.push('b'));
    expect(log).toEqual(['b']);
  });
});
