import { beforeEach, describe, expect, it, vi } from 'vitest';

// A stand-in Supabase client: records every call and answers from `answers` (per table and verb).
type Call = { table: string; verb: string; args: unknown[] };
const calls: Call[] = [];
const answers: Record<string, unknown[]> = {};
const answer = (key: string, fallback: unknown) => (answers[key]?.length ? answers[key].shift() : fallback);
const fake = {
  from(table: string) {
    const log = (verb: string, ...args: unknown[]) => calls.push({ table, verb, args });
    // An Error answer stands for a request that gave up (an abort).
    const done = (key: string) => ({
      abortSignal: () => {
        const a = answer(key, { error: null });
        return a instanceof Error ? Promise.reject(a) : Promise.resolve(a);
      },
    });
    return {
      update(v: unknown) {
        log('update', v);
        return {
          eq(c: string, x: string) {
            log('eq', c, x);
            return {
              neq(c2: string, x2: string) {
                log('neq', c2, x2);
                return { select: (s: string) => (log('select', s), { abortSignal: () => Promise.resolve(answer(`${table}.update`, { data: [{ id: x }], error: null })) }) };
              },
            };
          },
        };
      },
      insert(v: unknown) {
        log('insert', v);
        return done(`${table}.insert`);
      },
      upsert(v: unknown, o: unknown) {
        log('upsert', v, o);
        return done(`${table}.upsert`);
      },
      delete() {
        log('delete');
        return { eq: (c: string, x: string) => (log('eq', c, x), done(`${table}.delete`)) };
      },
    };
  },
};
vi.mock('@btx/data', () => ({ getBrowserClient: () => fake }));

const { addTask, forgetIds, markDone, moveDue, reopen, writeComment } = await import('@/components/tasks/tasks-writes');
const DUP = { code: '23505', message: 'duplicate key value' };
const DENIED = { code: '42501', message: 'permission denied' };

beforeEach(() => {
  calls.length = 0;
  for (const k of Object.keys(answers)) delete answers[k];
});

describe('status and due writes (M1: the writer refuses approvals)', () => {
  it("every update carries neq('type','approval') before asking for the row back", async () => {
    await markDone('t1');
    await reopen('t1', 'in_progress');
    await moveDue('t1', '2026-11-16');
    const verbs = calls.map((c) => c.verb);
    expect(verbs).toEqual(['update', 'eq', 'neq', 'select', 'update', 'eq', 'neq', 'select', 'update', 'eq', 'neq', 'select']);
    for (const c of calls.filter((x) => x.verb === 'neq')) expect(c.args).toEqual(['type', 'approval']);
  });
  it('sends only the status (no browser clock), and Undo restores the previous status', async () => {
    await markDone('t1');
    await reopen('t1', 'in_progress');
    await reopen('t1');
    expect(calls.filter((c) => c.verb === 'update').map((c) => c.args[0])).toEqual([{ status: 'done' }, { status: 'in_progress' }, { status: 'open' }]);
  });
  it('a refused write (zero rows back, as for an approval) returns false', async () => {
    answers['tasks.update'] = [{ data: [], error: null }, { data: null, error: DENIED }];
    expect(await markDone('ap1')).toBe(false);
    expect(await moveDue('ap1', '2026-11-16')).toBe(false);
    expect(await reopen('t1')).toBe(true);
  });
});

describe('addTask (M2: no twins, no orphans)', () => {
  const ids = () => calls.filter((c) => c.table === 'tasks' && c.verb === 'insert').map((c) => (c.args[0] as { id: string }).id);
  it('inserts a browser-made id, then the owner row idempotently', async () => {
    const id = await addTask('Book the room', 'programs', '2026-11-12', 'me');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls[0]).toMatchObject({ table: 'tasks', verb: 'insert', args: [{ id, title: 'Book the room', area: 'programs', type: 'task', due_on: '2026-11-12' }] });
    expect(calls[1]).toMatchObject({ table: 'task_assignees', verb: 'upsert', args: [{ task_id: id, user_id: 'me' }, { onConflict: 'task_id,user_id', ignoreDuplicates: true }] });
  });
  it('a retry of the same words after a failure reuses the id, and "already exists" counts as success', async () => {
    answers['tasks.insert'] = [{ error: DENIED }, { error: DUP }];
    expect(await addTask('Retry me', 'money', null, 'me')).toBeNull();
    const again = await addTask('Retry me', 'money', null, 'me');
    expect(again).not.toBeNull();
    expect(ids()).toEqual([again, again]);
    // After the success the same words make a new task.
    const third = await addTask('Retry me', 'money', null, 'me');
    expect(third).not.toBe(again);
  });
  it('different words get a new id', async () => {
    answers['tasks.insert'] = [{ error: DENIED }];
    await addTask('One', 'money', null, 'me');
    await addTask('Two', 'money', null, 'me');
    const [a, b] = ids();
    expect(a).not.toBe(b);
  });
  it('a failed owner row takes out a task this attempt made; a duplicate owner row counts as saved', async () => {
    answers['task_assignees.upsert'] = [{ error: DENIED }];
    expect(await addTask('Orphan?', 'money', null, 'me')).toBeNull();
    expect(calls.some((c) => c.table === 'tasks' && c.verb === 'delete')).toBe(true);
    answers['task_assignees.upsert'] = [{ error: DUP }];
    expect(await addTask('Dup owner', 'money', null, 'me')).not.toBeNull();
  });
  it('a retry that finds the task already there never deletes it; a failed cleanup keeps the id for the retry', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    // First try: the task is made, its owner row fails, and taking it back out fails too.
    answers['task_assignees.upsert'] = [{ error: DENIED }, { error: DENIED }, { error: null }];
    answers['tasks.delete'] = [{ error: DENIED }];
    expect(await addTask('Keep me', 'money', null, 'me')).toBeNull();
    expect(err).toHaveBeenCalledTimes(1);
    // Second try: the task is already there (23505) and the owner row fails again: no delete this time.
    answers['tasks.insert'] = [{ error: DUP }, { error: DUP }];
    const deletesBefore = calls.filter((c) => c.verb === 'delete').length;
    expect(await addTask('Keep me', 'money', null, 'me')).toBeNull();
    expect(calls.filter((c) => c.verb === 'delete').length).toBe(deletesBefore);
    // Third try: the owner row lands, on the same task.
    const third = await addTask('Keep me', 'money', null, 'me');
    expect(third).not.toBeNull();
    expect(new Set(ids())).toEqual(new Set([third]));
    err.mockRestore();
  });
});

describe('round 3: refresh-listed ids and aborted owner rows', () => {
  const ids = () => calls.filter((c) => c.table === 'tasks' && c.verb === 'insert').map((c) => (c.args[0] as { id: string }).id);
  it('a deliberate second "Call Sam" after the first one is on the board makes a new task', async () => {
    answers['tasks.insert'] = [{ error: DENIED }];
    expect(await addTask('Call Sam', 'outreach', null, 'me')).toBeNull();
    const [first] = ids();
    // The refresh lists the task (its first try had landed): the board forgets the id.
    forgetIds([first]);
    const second = await addTask('Call Sam', 'outreach', null, 'me');
    expect(second).not.toBe(first);
  });
  it('an owner write that gives up after the task was made keeps the id for a retry and logs it once', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    answers['task_assignees.upsert'] = [new Error('aborted')];
    expect(await addTask('Half made', 'money', null, 'me')).toBeNull();
    expect(err).toHaveBeenCalledTimes(1);
    answers['tasks.insert'] = [{ error: DUP }];
    const again = await addTask('Half made', 'money', null, 'me');
    expect(new Set(ids())).toEqual(new Set([again]));
    err.mockRestore();
  });
});

describe('writeComment', () => {
  it('inserts a browser-made id; a retry of the same words reuses it and "already exists" counts as saved', async () => {
    answers['task_comments.insert'] = [{ error: DENIED }, { error: DUP }];
    expect(await writeComment('t1', 'On it', 'me')).toBeNull();
    const id = await writeComment('t1', 'On it', 'me');
    expect(id).not.toBeNull();
    const sent = calls.filter((c) => c.table === 'task_comments').map((c) => c.args[0]);
    expect(sent).toEqual([
      { id, task_id: 't1', body: 'On it' },
      { id, task_id: 't1', body: 'On it' },
    ]);
  });
});
