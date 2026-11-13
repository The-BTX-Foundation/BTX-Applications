// Saving a person's own notes (lib/interview-notes-db.ts saveOwnNote) against a stand-in client: update the author's row,
// add it the first time, update again when a second tab added it first (23505), exactly one row or it is not saved, a
// timeout is not saved, and the overall box filters question_id IS NULL.
import { describe, expect, it } from 'vitest';
import type { Db } from '@/lib/interview-notes-db';
import { NOTE_MAX, saveOwnNote } from '@/lib/interview-notes-db';

type Res = { data: unknown[] | null; error: { code: string } | null } | 'timeout';
type Call = { op: 'update' | 'insert'; payload: unknown; filters: [string, string, unknown][] };

function client(results: Res[]) {
  const calls: Call[] = [];
  const db = {
    from: () => {
      const call: Call = { op: 'update', payload: null, filters: [] };
      const b = {
        update: (p: unknown) => ((call.op = 'update'), (call.payload = p), b),
        insert: (p: unknown) => ((call.op = 'insert'), (call.payload = p), b),
        eq: (c: string, v: unknown) => (call.filters.push(['eq', c, v]), b),
        is: (c: string, v: unknown) => (call.filters.push(['is', c, v]), b),
        select: () => b,
        abortSignal: () => {
          calls.push(call);
          const r = results.shift() ?? { data: [], error: null };
          if (r === 'timeout') {
            const e = new Error('timed out');
            e.name = 'TimeoutError';
            return Promise.reject(e);
          }
          return Promise.resolve(r);
        },
      };
      return b;
    },
  };
  return { db: db as unknown as Db, calls };
}

const W = { slotId: 's', questionId: 'q', authorId: 'me', body: 'words' };
const one = { data: [{ id: 'n' }], error: null };
const none = { data: [], error: null };

describe('saveOwnNote', () => {
  it('updates the existing row: one row back is saved, no insert', async () => {
    const { db, calls } = client([one]);
    expect(await saveOwnNote(db, W)).toEqual({ ok: true });
    expect(calls.map((c) => c.op)).toEqual(['update']);
    expect(calls[0].filters).toEqual([
      ['eq', 'slot_id', 's'],
      ['eq', 'author_id', 'me'],
      ['eq', 'question_id', 'q'],
    ]);
  });
  it('the overall box filters question_id IS NULL', async () => {
    const { db, calls } = client([one]);
    await saveOwnNote(db, { ...W, questionId: null });
    expect(calls[0].filters[2]).toEqual(['is', 'question_id', null]);
  });
  it('no row yet: inserts it as the author', async () => {
    const { db, calls } = client([none, one]);
    expect(await saveOwnNote(db, W)).toEqual({ ok: true });
    expect(calls.map((c) => c.op)).toEqual(['update', 'insert']);
    expect(calls[1].payload).toEqual({ slot_id: 's', question_id: 'q', author_id: 'me', body: 'words' });
  });
  it('another tab added it first (23505): updates again', async () => {
    const { db, calls } = client([none, { data: null, error: { code: '23505' } }, one]);
    expect(await saveOwnNote(db, W)).toEqual({ ok: true });
    expect(calls.map((c) => c.op)).toEqual(['update', 'insert', 'update']);
  });
  it('refused or empty insert, two rows, or a database error is not saved', async () => {
    expect(await saveOwnNote(client([none, { data: null, error: { code: '42501' } }]).db, W)).toEqual({ ok: false, code: '42501' });
    expect(await saveOwnNote(client([none, none]).db, W)).toEqual({ ok: false, code: 'no_row' });
    expect(await saveOwnNote(client([{ data: [{}, {}], error: null }]).db, W)).toEqual({ ok: false, code: 'too_many_rows' });
    expect(await saveOwnNote(client([{ data: null, error: { code: '08006' } }]).db, W)).toEqual({ ok: false, code: '08006' });
  });
  it('a timeout is not saved', async () => {
    expect(await saveOwnNote(client(['timeout']).db, W)).toEqual({ ok: false, code: 'timeout' });
  });
  it('cuts words to the table limit', async () => {
    const { db, calls } = client([one]);
    await saveOwnNote(db, { ...W, body: 'x'.repeat(NOTE_MAX + 50) });
    expect((calls[0].payload as { body: string }).body.length).toBe(NOTE_MAX);
  });
});
