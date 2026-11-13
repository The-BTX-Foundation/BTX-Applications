// Send on the refreshed Your availability page (lib/availability-flow.ts): the existing saveAvailability action is called
// once with the whole draft and send: true (the current page's call); a refusal keeps its message, a throw says
// "Couldn't save. Try again.", no answer in 15 seconds says "No answer in time. Reload to check.", and a re-read that
// finds the draft saved with a newer sent time counts as landed.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NO_ANSWER, SAVE_ERR, runRead, runSend, sendInput, sendLanded, submitDay } from '@/lib/availability-flow';

afterEach(() => vi.useRealTimers());

const input = sendInput([{ day: '2026-11-12', startMin: 1020, endMin: 1260 }], 5, 'note', ['Jordan Pierce']);

describe('availability send', () => {
  it('builds the current page input: every range, limit, note, names, send: true', () => {
    expect(input).toEqual({ ranges: [{ day: '2026-11-12', start: '17:00', end: '21:00' }], maxInterviews: 5, text: 'note', conflicts: ['Jordan Pierce'], send: true });
  });
  it('saved: the server ranges and sent time', async () => {
    const save = vi.fn(async () => ({ ok: true as const, ranges: input.ranges, sentAt: '2026-11-10T14:14:00Z', summary: [] }));
    expect(await runSend(save, input)).toEqual({ kind: 'ok', ranges: input.ranges, sentAt: '2026-11-10T14:14:00Z', cover: [] });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(input);
  });
  it('refused keeps the message; a throw is the plain error', async () => {
    expect(await runSend(async () => ({ ok: false as const, message: 'Pick at least one time.' }), input)).toEqual({ kind: 'refused', message: 'Pick at least one time.' });
    expect(await runSend(async () => Promise.reject(new Error('x')), input)).toEqual({ kind: 'refused', message: SAVE_ERR });
  });
  it('no answer in time is unknown, with the reload words', async () => {
    vi.useFakeTimers();
    const p = runSend(() => new Promise(() => {}), input, 15_000);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await p).toEqual({ kind: 'unknown', message: NO_ANSWER });
  });
  it('the reader fails plainly on a throw', async () => {
    const r = await runRead(async () => Promise.reject(new Error('x')), 'whenever');
    expect(r.ok).toBe(false);
  });
  it('landed only when the server holds the draft with a newer sent time', () => {
    expect(sendLanded('a', 'a', '2026-11-02T23:14:00Z', '2026-11-10T14:14:00Z')).toBe(true);
    expect(sendLanded('a', 'a', '2026-11-02T23:14:00Z', '2026-11-02T23:14:00Z')).toBe(false);
    expect(sendLanded('a', 'b', null, '2026-11-10T14:14:00Z')).toBe(false);
  });
  it('the submit day: live re-reads the Eastern clock; mock keeps the sample day', () => {
    const late = new Date('2026-11-12T04:30:00Z'); // 11:30 PM Nov 11 Eastern
    expect(submitDay(true, '2026-11-10', late)).toBe('2026-11-11');
    expect(submitDay(false, '2026-11-10', late)).toBe('2026-11-10');
  });
});
