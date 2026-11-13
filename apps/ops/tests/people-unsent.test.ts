// The unsent nudge words store (lib/people-unsent.ts): per signed-in person, per recipient, cleared for a new owner.
import { beforeEach, describe, expect, it } from 'vitest';
import { claimNudgeWords, nudgeWordsSnapshot, resetNudgeWords, setNudgeWords, subscribeNudgeWords } from '@/lib/people-unsent';

beforeEach(() => resetNudgeWords());

describe('people-unsent', () => {
  it('keeps words per recipient for the owner only, and survives a remount by the same person', () => {
    claimNudgeWords('me');
    setNudgeWords('me', 'kd', 'Hi Keith');
    setNudgeWords('other', 'kd', 'not mine');
    expect(nudgeWordsSnapshot('me')).toEqual({ kd: 'Hi Keith' });
    expect(nudgeWordsSnapshot('other')).toEqual({});
    claimNudgeWords('me');
    expect(nudgeWordsSnapshot('me')).toEqual({ kd: 'Hi Keith' });
  });
  it('a different person signing in clears the words; null drops one; changes notify once', () => {
    claimNudgeWords('me');
    let n = 0;
    const off = subscribeNudgeWords(() => n++);
    setNudgeWords('me', 'kd', 'a');
    setNudgeWords('me', 'kd', 'a');
    setNudgeWords('me', 'kd', null);
    setNudgeWords('me', 'kd', null);
    expect(n).toBe(2);
    setNudgeWords('me', 'ds', 'b');
    claimNudgeWords('someone-else');
    expect(nudgeWordsSnapshot('someone-else')).toEqual({});
    expect(nudgeWordsSnapshot('me')).toEqual({});
    off();
  });
});

describe('sendKeepingWords (the words a send started with are the words Retry sends)', () => {
  it('saves the sent words at the start, keeps them on failure even if the draft changed, drops them once saved', async () => {
    const { sendKeepingWords } = await import('@/lib/people-unsent');
    claimNudgeWords('me');
    let fail: (e: Error) => void = () => {};
    const p = sendKeepingWords('me', 'kd', 'Hi Keith, the words sent', () => new Promise<string>((_, rej) => (fail = rej)));
    expect(nudgeWordsSnapshot('me').kd).toBe('Hi Keith, the words sent');
    fail(new Error('network'));
    await expect(p).rejects.toThrow();
    expect(nudgeWordsSnapshot('me').kd).toBe('Hi Keith, the words sent');
    await sendKeepingWords('me', 'kd', 'Hi Keith, the words sent', async (b) => b);
    expect(nudgeWordsSnapshot('me').kd).toBeUndefined();
  });
});
