// The Interview questions page's writes, called from the browser (components/questions/questions-board.tsx). Live mode
// calls the page's existing server actions exactly as the old page did (lib/actions/interview-questions.ts: admin only,
// row-level security applies; nothing here changes them) and adds, around them:
//
// - a 15-second limit on every call: past it the answer is "timeout" (the write may still have gone through), never a
//   resend;
// - the edit guard: right before an edit is written, the question is read again as the signed-in person (browser client,
//   RLS) and the edit is refused when its text is no longer the text the person started from, so one board member never
//   silently overwrites another's newer edit (lib/questions-flow.ts guardEdit). A small window remains between that read
//   and the write: the existing action takes no "expected text";
// - a retried add first reads the group again: the existing add action makes the id on the server, so a first try that
//   saved but lost its answer is found by its words and is never sent twice (lib/questions-flow.ts retryAdd);
// - a drag is the same one-place moves, one after another, stopping at the first failure (the page then re-reads);
// - an edit whose question already holds the person's words (a first try that saved but lost its answer) counts as saved;
// - Undo of an add reads the question first and removes it only while it still holds the added words;
// - the starter questions read the cycle's questions before and after, so the saved line says how many were added.
//
// Mock mode writes nothing: the board keeps the change in its own state; `?demo=failsave|conflict|timeout` make the
// mock writer answer with that failure. The actions and the reader are passed in so tests can stand in.
import { getBrowserClient } from '@btx/data';
import { addStarterQuestions, moveInterviewQuestion, removeInterviewQuestion, saveInterviewQuestion } from './actions/interview-questions';
import { readAllPages } from './calendar-paging';
import { ERR_SAVE, ERR_UNDO_CHANGED, guardEdit, guardUndoAdd, retryAdd, withTimeout, type NotSaved, type WriteOutcome } from './questions-flow';
import { CLOSE_KEY, gkOf } from './questions-map';
import type { QnGroup, QnMockWrite } from './questions-view';

/** One call's time limit. */
export const WRITE_MS = 15_000;

type Msg = { ok: boolean; message: string };

/** The existing server actions, as the page calls them. */
export type QnActions = {
  save: (cycleId: string, q: { id?: string; criterionKey: string | null; text: string }) => Promise<Msg & { id?: string }>;
  remove: (id: string) => Promise<Msg>;
  move: (id: string, direction: 'up' | 'down') => Promise<Msg>;
  starter: (cycleId: string) => Promise<Msg>;
};

/** The real actions. */
export const REAL_ACTIONS: QnActions = { save: saveInterviewQuestion, remove: removeInterviewQuestion, move: moveInterviewQuestion, starter: addStarterQuestions };

/** A question as the guard and the retry check read it. */
export type PeekRow = { id: string; criterionKey: string | null; text: string };

/** The reads the guard and the retry check make (null = gone; 'failed' = could not read). */
export type QnPeek = {
  one: (id: string) => Promise<{ text: string } | null | 'failed'>;
  list: (cycleId: string) => Promise<PeekRow[] | 'failed'>;
};

type Res = { data: Record<string, unknown>[] | null; error: unknown };
type Q = PromiseLike<Res> & {
  eq: (c: string, v: unknown) => Q;
  order: (c: string, o: { ascending: boolean }) => Q;
  limit: (n: number) => Q;
  range: (a: number, b: number) => Q;
  abortSignal: (s: AbortSignal) => Q;
};
type Loose = { from: (t: string) => { select: (c: string) => Q } };

/** The browser client's reads (the signed-in person, row-level security applies). */
export function browserPeek(client: () => Loose = () => getBrowserClient() as unknown as Loose): QnPeek {
  return {
    async one(id) {
      try {
        const r = await client().from('interview_questions').select('id, text').eq('id', id).limit(1).abortSignal(AbortSignal.timeout(WRITE_MS));
        if (r.error) return 'failed';
        const row = (r.data ?? [])[0];
        return row ? { text: String(row.text ?? '') } : null;
      } catch {
        return 'failed';
      }
    },
    async list(cycleId) {
      try {
        const rows = await readAllPages('interview_questions', async (from, to) => {
          const r = await client()
            .from('interview_questions')
            .select('id, criterion_key, text')
            .eq('cycle_id', cycleId)
            .order('position', { ascending: true })
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to)
            .abortSignal(AbortSignal.timeout(WRITE_MS));
          if (r.error) throw r.error;
          return r.data ?? [];
        });
        return rows.map((x) => ({ id: String(x.id), criterionKey: x.criterion_key == null ? null : String(x.criterion_key), text: String(x.text ?? '') }));
      } catch {
        return 'failed';
      }
    },
  };
}

/** A read of the cycle's questions as groups keyed like the page's (names do not matter to the retry check). */
export function peekGroups(rows: PeekRow[]): QnGroup[] {
  const by = new Map<string, QnGroup>();
  for (const r of rows) {
    const gk = gkOf(r.criterionKey);
    if (!by.has(gk)) by.set(gk, { key: r.criterionKey, name: gk, weight: null, questions: [] });
    by.get(gk)?.questions.push({ id: r.id, text: r.text });
  }
  return [...by.values()];
}

/** The database key of a group key (CLOSE_KEY = null). */
export const keyOf = (gk: string): string | null => (gk === CLOSE_KEY ? null : gk);

/** Everything the page writes. */
export type QnWriter = {
  edit: (cycleId: string, gk: string, id: string, words: string, fromText: string) => Promise<WriteOutcome>;
  add: (cycleId: string, gk: string, words: string) => Promise<WriteOutcome>;
  /** A retry of a failed add: reads the group first and sends only if the words are not there yet. */
  retryAdd: (cycleId: string, n: Extract<NotSaved, { kind: 'add' }>) => Promise<WriteOutcome | { ok: true; already: true }>;
  remove: (id: string) => Promise<WriteOutcome>;
  /** Undo of an add: removes the question only while it still holds `words`. */
  undoAdd: (id: string, words: string) => Promise<WriteOutcome>;
  /** One-place moves, one after another; stops at the first that fails. `done` = how many went through. */
  move: (id: string, moves: ('up' | 'down')[]) => Promise<WriteOutcome & { done: number }>;
  starter: (cycleId: string) => Promise<WriteOutcome>;
};

// An action's answer as an outcome: 'timeout' when it took too long, 'failed' with its plain message when it said no.
async function run<T extends Msg>(p: () => Promise<T>): Promise<WriteOutcome> {
  try {
    const r = await withTimeout(p(), WRITE_MS);
    if (r === 'timeout') return { ok: false, kind: 'timeout', message: '' };
    if (r.ok) return { ok: true, id: (r as { id?: string }).id };
    if (/gone/i.test(r.message)) return { ok: false, kind: 'gone', message: r.message };
    return { ok: false, kind: 'failed', message: r.message || ERR_SAVE };
  } catch {
    return { ok: false, kind: 'failed', message: ERR_SAVE };
  }
}

/** The live writer: the existing server actions (unchanged), the guard read and the retry read. */
export function liveWriter(actions: QnActions = REAL_ACTIONS, peek: QnPeek = browserPeek()): QnWriter {
  return {
    async edit(cycleId, gk, id, words, fromText) {
      const verdict = guardEdit(await peek.one(id), fromText, words);
      if (verdict === 'saved') return { ok: true };
      if (verdict === 'failed') return { ok: false, kind: 'failed', message: ERR_SAVE };
      if (verdict === 'gone') return { ok: false, kind: 'gone', message: '' };
      if (verdict === 'changed') return { ok: false, kind: 'conflict', message: '' };
      return run(() => actions.save(cycleId, { id, criterionKey: keyOf(gk), text: words }));
    },
    add(cycleId, gk, words) {
      return run(() => actions.save(cycleId, { criterionKey: keyOf(gk), text: words }));
    },
    async retryAdd(cycleId, n) {
      const fresh = await peek.list(cycleId);
      const d = retryAdd(n, fresh === 'failed' ? 'failed' : peekGroups(fresh));
      if (d === 'failed') return { ok: false, kind: 'failed', message: ERR_SAVE };
      if (d === 'already') return { ok: true, already: true };
      return run(() => actions.save(cycleId, { criterionKey: keyOf(n.gk), text: n.words }));
    },
    async remove(id) {
      const o = await run(() => actions.remove(id));
      // Already gone is what a removal wants (a repeat after a lost answer): it counts as done.
      return !o.ok && o.kind === 'gone' ? { ok: true } : o;
    },
    async undoAdd(id, words) {
      const verdict = guardUndoAdd(await peek.one(id), words);
      if (verdict === 'gone') return { ok: true };
      if (verdict === 'failed') return { ok: false, kind: 'failed', message: ERR_SAVE };
      if (verdict === 'changed') return { ok: false, kind: 'failed', message: ERR_UNDO_CHANGED };
      const o = await run(() => actions.remove(id));
      return !o.ok && o.kind === 'gone' ? { ok: true } : o;
    },
    async move(id, moves) {
      let done = 0;
      for (const m of moves) {
        const o = await run(() => actions.move(id, m));
        if (!o.ok) return { ...o, done };
        done += 1;
      }
      return { ok: true, done };
    },
    async starter(cycleId) {
      const before = await peek.list(cycleId);
      const o = await run(() => actions.starter(cycleId));
      if (!o.ok) return o;
      const after = await peek.list(cycleId);
      // The true number added, or none when either read failed (the line then says they are on the list).
      return before === 'failed' || after === 'failed' ? { ok: true } : { ok: true, added: Math.max(0, after.length - before.length) };
    },
  };
}

/** The mock writer: saves nothing (the board keeps the change), answers with the failure `?demo=` asks for. */
export function mockWriter(mode: QnMockWrite): QnWriter {
  let n = 0;
  const fail = (): WriteOutcome | null => (mode === 'failsave' ? { ok: false, kind: 'failed', message: ERR_SAVE } : mode === 'timeout' ? { ok: false, kind: 'timeout', message: '' } : null);
  return {
    async edit() {
      if (mode === 'conflict') return { ok: false, kind: 'conflict', message: '' };
      return fail() ?? { ok: true };
    },
    async add() {
      return fail() ?? { ok: true, id: `mock-new-${++n}` };
    },
    async retryAdd() {
      return fail() ?? { ok: true, id: `mock-new-${++n}` };
    },
    async remove() {
      return fail() ?? { ok: true };
    },
    async undoAdd() {
      return fail() ?? { ok: true };
    },
    async move(_id, moves) {
      const f = fail();
      return f ? { ...f, done: 0 } : { ok: true, done: moves.length };
    },
    async starter() {
      return fail() ?? { ok: true };
    },
  };
}
