// The Board members page's live writes (components/people/people-writes.ts) with the server action and the chat writers
// mocked: a role change reports success only when the server said so, a timeout is "no answer" (never success) and a thrown
// error is a plain failure; a nudge reuses its message id for a retry of the same words and counts as sent only once saved.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ changeRoleAction: vi.fn(), openDirect: vi.fn(), postMessage: vi.fn() }));
vi.mock('@/lib/people-actions', () => ({ changeRoleAction: h.changeRoleAction }));
vi.mock('@/lib/chat-actions', () => ({ openDirect: h.openDirect, postMessage: h.postMessage, sendBudget: () => new AbortController().signal }));

import { LIMIT_MS, ROLE_FAILED, ROLE_TIMEOUT, changeRoleLive, sendNudgeLive } from '@/components/people/people-writes';

beforeEach(() => {
  h.changeRoleAction.mockReset();
  h.openDirect.mockReset().mockResolvedValue('chan-1');
  h.postMessage.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('changeRoleLive', () => {
  it('success: the server said ok', async () => {
    h.changeRoleAction.mockResolvedValue({ ok: true });
    expect(await changeRoleLive('u2', 'admin')).toEqual({ ok: true });
    expect(h.changeRoleAction).toHaveBeenCalledWith('u2', 'admin');
  });
  it("refusal: the server's own reason", async () => {
    h.changeRoleAction.mockResolvedValue({ ok: false, reason: "You can't change your own admin rights." });
    expect(await changeRoleLive('u2', 'board')).toEqual({ ok: false, reason: "You can't change your own admin rights." });
  });
  it('timeout: "no answer in time", never success, even if the server answers ok later', async () => {
    vi.useFakeTimers();
    let answer: (v: unknown) => void = () => {};
    h.changeRoleAction.mockReturnValue(new Promise((r) => (answer = r)));
    const p = changeRoleLive('u2', 'admin');
    await vi.advanceTimersByTimeAsync(LIMIT_MS);
    answer({ ok: true });
    const r = await p;
    expect(r.ok).toBe(false);
    expect(r).toEqual({ ok: false, reason: ROLE_TIMEOUT, unknown: true });
    expect(ROLE_TIMEOUT).toBe('No answer in time. Reload to check.');
  });
  it('a thrown error (network): "Couldn\'t save. Try again.", not the timeout line', async () => {
    h.changeRoleAction.mockRejectedValue(new Error('fetch failed'));
    const r = await changeRoleLive('u2', 'admin');
    expect(r).toEqual({ ok: false, reason: ROLE_FAILED });
    expect(ROLE_FAILED).toBe("Couldn't save. Try again.");
  });
});

describe('sendNudgeLive', () => {
  it('a retry of the same words within two minutes reuses the message id; other words or a later retry get a new one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-12T15:00:00Z'));
    h.postMessage.mockRejectedValueOnce(new Error('network'));
    await expect(sendNudgeLive('me', 'kd', 'Hi Keith, reuse test')).rejects.toThrow();
    const first = h.postMessage.mock.calls[0][2].id;
    h.postMessage.mockRejectedValueOnce(new Error('network'));
    vi.setSystemTime(new Date('2026-11-12T15:01:00Z'));
    await expect(sendNudgeLive('me', 'kd', 'Hi Keith, reuse test')).rejects.toThrow();
    expect(h.postMessage.mock.calls[1][2].id).toBe(first);
    h.postMessage.mockRejectedValueOnce(new Error('network'));
    await expect(sendNudgeLive('me', 'kd', 'Hi Keith, other words')).rejects.toThrow();
    expect(h.postMessage.mock.calls[2][2].id).not.toBe(first);
    // Past two minutes since the last failure: a new id (a new message on purpose).
    h.postMessage.mockResolvedValueOnce({ id: 'x', createdAt: '2026-11-12T15:04:00Z' });
    vi.setSystemTime(new Date('2026-11-12T15:03:30Z'));
    await sendNudgeLive('me', 'kd', 'Hi Keith, reuse test');
    expect(h.postMessage.mock.calls[3][2].id).not.toBe(first);
  });
  it('counts as sent only once the insert (or the duplicate read-back) answered', async () => {
    let saved: (v: unknown) => void = () => {};
    h.postMessage.mockReturnValue(new Promise((r) => (saved = r)));
    let done = false;
    const p = sendNudgeLive('me', 'ds', 'Hi Dorian, saved test').then((r) => {
      done = true;
      return r;
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(done).toBe(false);
    expect(h.openDirect).toHaveBeenCalledWith('ds', expect.anything());
    saved({ id: 'm1', createdAt: '2026-11-12T15:00:00Z' });
    expect(await p).toEqual({ createdAt: '2026-11-12T15:00:00Z' });
  });
  it('a failed send rejects (the board keeps the words with Retry) and a success forgets the id', async () => {
    h.postMessage.mockRejectedValueOnce(new Error('network'));
    await expect(sendNudgeLive('me', 'ad', 'Hi Ada, fail test')).rejects.toThrow('network');
    const id = h.postMessage.mock.calls[0][2].id;
    h.postMessage.mockResolvedValueOnce({ id, createdAt: '2026-11-12T15:00:00Z' });
    await sendNudgeLive('me', 'ad', 'Hi Ada, fail test');
    expect(h.postMessage.mock.calls[1][2].id).toBe(id);
    h.postMessage.mockResolvedValueOnce({ id: 'n', createdAt: '2026-11-12T15:01:00Z' });
    await sendNudgeLive('me', 'ad', 'Hi Ada, fail test');
    expect(h.postMessage.mock.calls[2][2].id).not.toBe(id);
  });
  it('a failed opening of the conversation also rejects', async () => {
    h.openDirect.mockRejectedValueOnce(new Error('no channel'));
    await expect(sendNudgeLive('me', 'kd', 'Hi Keith, open fails')).rejects.toThrow('no channel');
    expect(h.postMessage).not.toHaveBeenCalled();
  });
});
