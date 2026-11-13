// The Interview questions page's write queue, kept outside React so it is unit-tested (tests/questions-queue.test.ts).
// Writes run one after another. A failed write bumps the generation: every write queued before that failure is then
// cancelled when its turn comes (its own `cancel` keeps the words or says "Not done"), and the board puts its last
// settled copy back. Each write is caught on its own: a write, an `ok` or a `fail` that throws counts as a failure and
// the chain stays alive for the writes after it. After every settled write (saved or failed) the page reads the server
// again; when nothing waits any more the board takes the server's copy again.
import type { WriteOutcome } from './questions-flow';

type Saved = Extract<WriteOutcome, { ok: true }>;
type Failed = Exclude<WriteOutcome, { ok: true }>;

/** One queued write. */
export type QueueOp = {
  write: () => Promise<WriteOutcome>;
  ok: (o: Saved) => void;
  fail: (o: Failed) => void;
  /** Its turn came after an earlier write failed: nothing is sent. */
  cancel: () => void;
};

/** What the board does around each write. */
export type QueueHooks = {
  /** A write failed (or its handler threw): put the last settled copy back. Runs before the op's own `fail`. */
  failed: (o: Failed) => void;
  /** After every settled write: read the server again. */
  settled: () => void;
  /** Nothing is queued or running any more. */
  idle: () => void;
};

/** The outcome a throw stands for. */
export const THREW: Failed = { ok: false, kind: 'failed', message: '' };

// Runs `fn`; a throw is swallowed and reported as false.
function safe(fn: () => void): boolean {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
}

/** A new queue. `push` returns the chain so tests can wait for it. */
export function writeQueue(hooks: QueueHooks) {
  let chain: Promise<void> = Promise.resolve();
  let gen = 0;
  let pending = 0;
  const fail = (op: QueueOp, o: Failed) => {
    gen += 1;
    safe(() => hooks.failed(o));
    safe(() => op.fail(o));
  };
  const push = (op: QueueOp): Promise<void> => {
    const mine = gen;
    pending += 1;
    const run = async () => {
      try {
        if (gen !== mine) {
          safe(op.cancel);
          return;
        }
        let o: WriteOutcome;
        try {
          o = await op.write();
        } catch {
          o = THREW;
        }
        if (o.ok) {
          const done = o;
          if (!safe(() => op.ok(done))) fail(op, THREW);
        } else fail(op, o);
        safe(hooks.settled);
      } finally {
        pending -= 1;
        if (pending === 0) safe(hooks.idle);
      }
    };
    chain = chain.then(run, run);
    return chain;
  };
  return { push, gen: () => gen, pending: () => pending };
}
