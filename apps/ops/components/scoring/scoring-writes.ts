// The Scoring page's three writes, in each mode. Live: the server actions in lib/actions/scoring.ts, called exactly as
// before (saveDraft, publishScore, savePrivateNote), each held to the time limit. Mock: the demo's timings on this device
// only (no server call), with `?demo=failsave` refusing every draft save and `?demo=slowpublish` getting no answer.
// Nothing here emails, notifies or messages anyone.
import { publishScore, saveDraft, savePrivateNote } from '@/lib/actions/scoring';
import { LIMIT_MS, within, type ActionResult } from '@/lib/scoring-flow';
import type { ScSim } from '@/lib/scoring-view';

/** A write's outcome: an answer within the limit, no answer in time, or a call that threw. */
export type WriteOut = { done: true; value: ActionResult } | { done: false } | { thrown: true };

/** The page's writes. */
export type ScWrites = {
  save: (applicationId: string, picks: Record<string, number>) => Promise<WriteOut>;
  publish: (applicationId: string, picks: Record<string, number>) => Promise<WriteOut>;
  note: (applicationId: string, note: string) => Promise<WriteOut>;
};

// A call held to the limit; a throw becomes `{ thrown: true }` (never a silent success).
async function held(call: () => Promise<ActionResult>, ms: number): Promise<WriteOut> {
  try {
    return await within(call(), ms);
  } catch {
    return { thrown: true };
  }
}

/** Live mode: the server actions, unchanged. */
export const liveWrites: ScWrites = {
  save: (id, picks) => held(() => saveDraft(id, picks), LIMIT_MS),
  publish: (id, picks) => held(() => publishScore(id, picks), LIMIT_MS),
  note: (id, text) => held(() => savePrivateNote(id, text), LIMIT_MS),
};

const wait = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

/** Mock mode: the demo's timings; `stamp` gives the demo's ticking clock ("9:21 AM"). */
export function mockWrites(sim: ScSim | null, stamp: () => string): ScWrites {
  return {
    save: async () => {
      await wait(450);
      if (sim?.failSave) return { done: true, value: { ok: false, message: "Couldn't save your draft." } };
      return { done: true, value: { ok: true, message: 'Draft saved.', savedAt: stamp() } };
    },
    publish: async () => {
      if (sim?.slowPublish) return held(() => new Promise<ActionResult>(() => {}), 1500);
      await wait(500);
      return { done: true, value: { ok: true, message: 'Published.' } };
    },
    note: async () => ({ done: true, value: { ok: true, message: 'Saved.', savedAt: stamp() } }),
  };
}
