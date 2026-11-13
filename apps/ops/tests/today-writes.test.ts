import { beforeEach, describe, expect, it, vi } from 'vitest';

// A stand-in Supabase client for Today's writes: records updates and answers the status read.
const updates: { values: unknown; neq: unknown[] }[] = [];
let status: unknown = 'in_progress';
const fake = {
  from: () => ({
    update: (values: unknown) => ({
      eq: (_c: string, id: string) => ({
        neq: (...neq: unknown[]) => {
          updates.push({ values, neq });
          return { select: () => ({ abortSignal: () => Promise.resolve({ data: [{ id }], error: null }) }) };
        },
      }),
    }),
    select: () => ({ eq: () => ({ abortSignal: () => Promise.resolve({ data: [{ status }], error: null }) }) }),
  }),
};
vi.mock('@btx/data', () => ({ getBrowserClient: () => fake }));
vi.mock('@/lib/chat-actions', () => ({ postMessage: async () => undefined }));

const { markDone, reopen, statusBefore } = await import('@/components/today/today-writes');

beforeEach(() => {
  updates.length = 0;
});

describe("Today's Undo puts back the status before the tick", () => {
  it('an in-progress task comes back in progress, with status-only writes that refuse approvals', async () => {
    status = 'in_progress';
    expect(await markDone('t1')).toBe(true);
    expect(statusBefore('t1')).toBe('in_progress');
    expect(await reopen('t1', statusBefore('t1'))).toBe(true);
    expect(updates.map((u) => u.values)).toEqual([{ status: 'done' }, { status: 'in_progress' }]);
    for (const u of updates) expect(u.neq).toEqual(['type', 'approval']);
  });
  it('an open task (or an unread status) comes back open', async () => {
    status = 'open';
    await markDone('t2');
    expect(statusBefore('t2')).toBe('open');
    status = null;
    await markDone('t3');
    expect(statusBefore('t3')).toBe('open');
    await reopen('t3');
    expect(updates.at(-1)?.values).toEqual({ status: 'open' });
  });
});
