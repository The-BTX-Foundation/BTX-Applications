// The Awardees page's live writes (components/awardees/awardees-writes.ts) against stand-in server actions: steps 1, 2, 3
// and 5 tick and untick, the funds step never goes through writeStep, "already sent" counts as saved, a timeout is a
// failure for a step and unknown for the money write, and a reminder only records the date.
import { describe, expect, it, vi } from 'vitest';
import { ALREADY_PAID } from '@/lib/awardees-map';
import { writeFunds, writeReminder, writeStep, type AwActions } from '@/components/awardees/awardees-writes';

// Stand-in actions answering `res` (or never answering when `res` is 'hang', or throwing when 'throw').
function actions(res: { ok: boolean; message: string } | 'hang' | 'throw') {
  const answer = () => (res === 'hang' ? new Promise<never>(() => {}) : res === 'throw' ? Promise.reject(new Error('network')) : Promise.resolve(res));
  const a = { setStepDone: vi.fn(answer), sendReminder: vi.fn(answer) };
  return a as typeof a & AwActions;
}
const OK = { ok: true, message: 'Saved.' };
const NO = { ok: false, message: 'Only board members can change awardee steps.' };

describe('writeStep', () => {
  it('writes step numbers 1, 2, 3 and 5 and reports the answer', async () => {
    const a = actions(OK);
    expect(await writeStep(a, 'a1', 0, true)).toBe(true);
    expect(await writeStep(a, 'a1', 4, false)).toBe(true);
    expect(a.setStepDone.mock.calls).toEqual([
      ['a1', 1, true],
      ['a1', 5, false],
    ]);
    expect(await writeStep(actions(NO), 'a1', 1, true)).toBe(false);
    expect(await writeStep(actions('throw'), 'a1', 1, true)).toBe(false);
  });
  it('never writes the funds step', async () => {
    const a = actions(OK);
    expect(await writeStep(a, 'a1', 3, false)).toBe(false);
    expect(await writeStep(a, 'a1', 3, true)).toBe(false);
    expect(a.setStepDone).not.toHaveBeenCalled();
  });
  it('counts a hung call as failed', async () => {
    expect(await writeStep(actions('hang'), 'a1', 2, true, 20)).toBe(false);
  });
});

describe('writeFunds', () => {
  it('ticks step 4 and counts "already sent" as saved', async () => {
    const a = actions(OK);
    expect(await writeFunds(a, 'a1')).toEqual({ kind: 'saved' });
    expect(a.setStepDone).toHaveBeenCalledWith('a1', 4, true);
    expect(await writeFunds(actions({ ok: false, message: ALREADY_PAID }), 'a1')).toEqual({ kind: 'already' });
  });
  it('passes a refusal on in plain words', async () => {
    expect(await writeFunds(actions({ ok: false, message: 'Set the amount first.' }), 'a1')).toEqual({ kind: 'refused', message: 'Set the amount first.' });
    expect(await writeFunds(actions({ ok: false, message: '' }), 'a1')).toEqual({ kind: 'refused', message: "Couldn't save. Try again." });
  });
  it('is unknown (never failed) when the call hangs or the network drops', async () => {
    expect(await writeFunds(actions('hang'), 'a1', 20)).toEqual({ kind: 'unknown' });
    expect(await writeFunds(actions('throw'), 'a1')).toEqual({ kind: 'unknown' });
  });
});

describe('writeReminder', () => {
  it('records step 2’s reminder only', async () => {
    const a = actions(OK);
    expect(await writeReminder(a, 'a1')).toBe(true);
    expect(a.sendReminder).toHaveBeenCalledWith('a1', 2);
    expect(a.setStepDone).not.toHaveBeenCalled();
    expect(await writeReminder(actions(NO), 'a1')).toBe(false);
    expect(await writeReminder(actions('hang'), 'a1', 20)).toBe(false);
  });
});
