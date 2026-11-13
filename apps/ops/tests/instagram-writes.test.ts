// The Instagram page's two live writes (lib/instagram-writes.ts) against a stand-in client: the insert's row and time
// limit, "already exists" as saved, exactly one row, a retry reusing the failed try's id, and the send's filters.
import { describe, expect, it } from 'vitest';
import { addPost, insertPostOnce, sendForApproval, SENDABLE, WRITE_MS, type IgWriteClient, type NewPost } from '@/lib/instagram-writes';
import { retryIds } from '@/lib/tasks-ids';

type Res = { data: { id: unknown }[] | null; error: unknown };
const P: NewPost = { channelId: 'ch1', title: 'Interview week', postOn: '2026-11-11', ownerId: 'u1' };

function client(answers: (() => Promise<Res>)[]) {
  const calls: { op: string; row?: Record<string, unknown>; filters: unknown[][]; select?: string; signal?: AbortSignal }[] = [];
  const next = () => (answers.length > 1 ? answers.shift()! : answers[0])();
  const c: IgWriteClient = {
    from: () => ({
      insert: (row) => {
        const call = { op: 'insert', row, filters: [] as unknown[][] } as (typeof calls)[number];
        calls.push(call);
        return { select: (s) => ((call.select = s), { abortSignal: (sig) => ((call.signal = sig), next()) }) };
      },
      update: (row) => {
        const call = { op: 'update', row, filters: [] as unknown[][] } as (typeof calls)[number];
        calls.push(call);
        const f = {
          eq: (k: string, v: unknown) => (call.filters.push(['eq', k, v]), f),
          in: (k: string, v: unknown[]) => (call.filters.push(['in', k, v]), f),
          not: (k: string, op: string, v: unknown) => (call.filters.push(['not', k, op, v]), f),
          neq: (k: string, v: unknown) => (call.filters.push(['neq', k, v]), f),
          select: (s: string) => ((call.select = s), { abortSignal: (sig: AbortSignal) => ((call.signal = sig), next()) }),
        };
        return f;
      },
    }),
  };
  return { c, calls };
}
const ok = async (): Promise<Res> => ({ data: [{ id: 'x' }], error: null });
const none = async (): Promise<Res> => ({ data: [], error: null });
const dup = async (): Promise<Res> => ({ data: null, error: { code: '23505' } });
const fail = async (): Promise<Res> => ({ data: null, error: { code: '42501' } });
const boom = async (): Promise<Res> => { throw new Error('network'); };

describe('insertPostOnce', () => {
  it('inserts one row with the browser-made id and a time limit', async () => {
    const { c, calls } = client([ok]);
    expect(WRITE_MS).toBe(15_000);
    expect(await insertPostOnce('id-1', P, c)).toBe(true);
    expect(calls[0]).toMatchObject({ op: 'insert', select: 'id', row: { id: 'id-1', channel_id: 'ch1', title: 'Interview week', post_on: '2026-11-11', owner_id: 'u1' } });
    expect(calls[0].signal).toBeInstanceOf(AbortSignal);
  });
  it('leaves the owner out when there is none', async () => {
    const { c, calls } = client([ok]);
    await insertPostOnce('id-1', { ...P, ownerId: null, postOn: null }, c);
    expect(calls[0].row).toEqual({ id: 'id-1', channel_id: 'ch1', title: 'Interview week', post_on: null });
  });
  it('counts "already exists" as saved, and anything else but exactly one row as not saved', async () => {
    expect(await insertPostOnce('i', P, client([dup]).c)).toBe(true);
    expect(await insertPostOnce('i', P, client([fail]).c)).toBe(false);
    expect(await insertPostOnce('i', P, client([none]).c)).toBe(false);
    expect(await insertPostOnce('i', P, client([boom]).c)).toBe(false);
  });
});

describe('addPost', () => {
  it('reuses the failed try id for a retry within two minutes, then a new one after a save', async () => {
    let n = 0;
    const memory = retryIds(() => `id-${++n}`);
    const { c, calls } = client([fail, ok, ok]);
    expect(await addPost(P, 'me', c, 1000, memory)).toEqual({ id: 'id-1', ok: false });
    expect(await addPost(P, 'me', c, 2000, memory)).toEqual({ id: 'id-1', ok: true });
    expect(calls.map((x) => x.row?.id)).toEqual(['id-1', 'id-1']);
    expect(await addPost(P, 'me', c, 3000, memory)).toEqual({ id: 'id-2', ok: true });
  });
  it('retries a Not-added row of any age with that row\'s own id (23505 counts as saved: no twin)', async () => {
    let n = 0;
    const memory = retryIds(() => `id-${++n}`);
    const { c, calls } = client([fail, dup]);
    const first = await addPost(P, 'me', c, 0, memory);
    expect(first).toEqual({ id: 'id-1', ok: false });
    // Ten minutes later the module memory has forgotten id-1; the row still holds it.
    expect(await addPost(P, 'me', c, 600_000, memory, first.id)).toEqual({ id: 'id-1', ok: true });
    expect(calls.map((x) => x.row?.id)).toEqual(['id-1', 'id-1']);
    expect(n).toBe(1);
  });
  it('makes a new id once two minutes have passed', async () => {
    let n = 0;
    const memory = retryIds(() => `id-${++n}`);
    const { c } = client([fail, ok]);
    await addPost(P, 'me', c, 0, memory);
    expect(await addPost(P, 'me', c, 121_000, memory)).toEqual({ id: 'id-2', ok: true });
  });
});

describe('sendForApproval', () => {
  it('sets awaiting_approval on one post with a caption and a photo, not past approval', async () => {
    const { c, calls } = client([ok]);
    expect(await sendForApproval('p1', c)).toBe('ok');
    expect(calls[0].row).toEqual({ status: 'awaiting_approval' });
    expect(calls[0].filters).toEqual([
      ['eq', 'id', 'p1'],
      ['in', 'status', SENDABLE],
      ['not', 'caption', 'is', null],
      ['neq', 'caption', ''],
      ['not', 'image_path', 'is', null],
      ['neq', 'image_path', ''],
    ]);
    expect(SENDABLE).not.toContain('approved');
    expect(calls[0].select).toBe('id');
    expect(calls[0].signal).toBeInstanceOf(AbortSignal);
  });
  it('says the post moved on when no row matched, and failed on an error or a lost answer', async () => {
    expect(await sendForApproval('p1', client([none]).c)).toBe('moved');
    expect(await sendForApproval('p1', client([fail]).c)).toBe('failed');
    expect(await sendForApproval('p1', client([boom]).c)).toBe('failed');
    expect(await sendForApproval('p1', client([async () => ({ data: [{ id: 'a' }, { id: 'b' }], error: null })]).c)).toBe('failed');
  });
});
