// The Scoring page's write rules, as plain functions (tests/scoring-flow.test.ts): the per-application save queue
// (serialized, latest wins), the time limit on a write, when Publish may run, the lock after publishing, how a local
// unsaved draft sits over the server's copy, and the words each outcome says. The page (components/scoring/*) calls the
// server actions in lib/actions/scoring.ts through these, unchanged.
import type { ScSheet } from './scoring-view';

/** How long a write may take before the page says "No answer in time" (the house limit). */
export const LIMIT_MS = 15_000;

/** The plain words after a write the page could not confirm. */
export const TIMEOUT_WORDS = 'No answer in time. Reload to check.';
/** The plain words when a write threw (no answer from the server at all). */
export const FAILED_WORDS = "Couldn't save your draft.";

/** A write's answer within the limit, or `{ done: false }` when the limit passed first. A rejection is passed on. */
export async function within<T>(p: Promise<T>, ms = LIMIT_MS): Promise<{ done: true; value: T } | { done: false }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<{ done: false }>((res) => {
    timer = setTimeout(() => res({ done: false }), ms);
  });
  try {
    return await Promise.race([p.then((value) => ({ done: true as const, value })), late]);
  } finally {
    clearTimeout(timer);
  }
}

/** What a save queue reports once the latest value for an id has been written (or failed). */
export type Settled<V, R> = { id: string; value: V; result: R | null; error: unknown };

/**
 * Saves per id, one at a time: while a save for an id is in flight, a new value waits, and only the newest waiting value
 * is written next (latest wins). `settle` is called once per burst, for the last value written, after its call returns.
 */
export function createSaveQueue<V, R>(write: (id: string, value: V) => Promise<R>, settle: (s: Settled<V, R>) => void) {
  const flying = new Set<string>();
  const waiting = new Map<string, V>();
  async function run(id: string, value: V): Promise<void> {
    flying.add(id);
    let result: R | null = null;
    let error: unknown = null;
    try {
      result = await write(id, value);
    } catch (e) {
      error = e ?? new Error('write failed');
    }
    if (waiting.has(id)) {
      const next = waiting.get(id) as V;
      waiting.delete(id);
      return run(id, next);
    }
    flying.delete(id);
    settle({ id, value, result, error });
  }
  return {
    /** Queue a value for an id (written now, or after the one in flight). */
    push(id: string, value: V): void {
      if (flying.has(id)) waiting.set(id, value);
      else void run(id, value);
    },
    /** True while a save for the id is in flight or waiting. */
    busy: (id: string): boolean => flying.has(id) || waiting.has(id),
  };
}

/** The picks after choosing `v` for `key`, or null when the sheet is published (locked: there is no un-publish, D8). */
export function applyPick(s: Pick<ScSheet, 'picks' | 'published'>, key: string, v: number): Record<string, number> | null {
  if (s.published || !Number.isInteger(v) || v < 1 || v > 5) return null;
  return { ...s.picks, [key]: v };
}

/** Publish may run: every criterion picked, not published yet, no draft save pending and no publish in flight. */
export function canPublish(s: Pick<ScSheet, 'picks' | 'published'>, keys: string[], saving: boolean, publishing: boolean): boolean {
  return !s.published && !saving && !publishing && keys.length > 0 && keys.every((k) => Boolean(s.picks[k]));
}

/** A draft the page holds on this device: being saved, saved (the server has it), or refused (kept with its words). */
export type LocalDraft = { picks: Record<string, number>; state: 'saving' | 'saved' | 'failed'; error: string | null; savedLabel: string | null };

/**
 * The sheet the page draws: the server's copy, with the local draft over it (being saved, saved since the last read, or
 * refused: a refused draft stays visible with its picks and its error). A published server copy always wins: it is locked.
 */
export function withLocal(server: ScSheet, local: LocalDraft | undefined): ScSheet {
  if (!local || server.published) return server;
  return { ...server, picks: local.picks };
}

/** Which local drafts survive a fresh read of the page: the ones still saving or refused, never over a published sheet. */
export function keepAfterRead(locals: Map<string, LocalDraft>, sheets: ScSheet[]): Map<string, LocalDraft> {
  const pub = new Set(sheets.filter((s) => s.published).map((s) => s.applicationId));
  return new Map([...locals].filter(([id, d]) => d.state !== 'saved' && !pub.has(id)));
}

/** The footer line for a sheet's draft. */
export function draftWords(local: LocalDraft | undefined, savedFromServer: string | null): string {
  if (local?.state === 'saving') return 'Saving…';
  if (local?.state === 'failed') return local.error ?? FAILED_WORDS;
  if (local?.savedLabel) return `Draft saved ${local.savedLabel}`;
  if (savedFromServer) return `Draft saved ${savedFromServer}`;
  return 'Scores save as you go';
}

/** The result of a save action (lib/actions/scoring.ts). */
export type ActionResult = { ok: boolean; message: string; savedAt?: string };

/** A save's outcome as the local draft: saved with its clock, or refused with the server's plain words or the time-out words. */
export function draftAfter(picks: Record<string, number>, out: { done: true; value: ActionResult } | { done: false } | { thrown: true }): LocalDraft {
  if ('thrown' in out) return { picks, state: 'failed', error: FAILED_WORDS, savedLabel: null };
  if (!out.done) return { picks, state: 'failed', error: TIMEOUT_WORDS, savedLabel: null };
  if (!out.value.ok) return { picks, state: 'failed', error: out.value.message || FAILED_WORDS, savedLabel: null };
  return { picks, state: 'saved', error: null, savedLabel: out.value.savedAt ?? null };
}

/** After a publish the page could not confirm, what the fresh read says the server holds. */
export function publishCheckWords(serverPublished: boolean | null): string {
  if (serverPublished === null) return "Couldn't check what saved. Reload to see it.";
  return serverPublished ? 'Your score was published.' : 'Not published. Your scores are still a draft.';
}

/** The plain words when a publish was refused or got no answer, before the re-read. */
export function publishFailWords(out: { done: true; value: ActionResult } | { done: false } | { thrown: true }): string {
  if ('thrown' in out || !out.done) return TIMEOUT_WORDS;
  return out.value.message || "Couldn't publish. Try again.";
}

/**
 * The sheet's picks, note and draft saves are locked: published (for good), or while any publish is in flight or being
 * checked, so nothing can change between what Publish sends and what the server stores.
 */
export function editLocked(s: Pick<ScSheet, 'published'>, publishing: string | null, checking: string | null): boolean {
  return s.published || publishing !== null || checking !== null;
}

/**
 * A draft save's answer still counts: not when the sheet is published (or shows as published on this device) or a
 * publish for it is in flight; then a late answer changes nothing and is not read out.
 */
export function draftAnswerCounts(id: string, s: Pick<ScSheet, 'published'> | undefined, publishing: string | null): boolean {
  return !!s && !s.published && publishing !== id;
}

/** Live mode asks before publishing (there is no un-publish); the mock publishes at once and offers Undo, as the demo. */
export const publishAsksFirst = (caps: { undoPublish: boolean }): boolean => !caps.undoPublish;
