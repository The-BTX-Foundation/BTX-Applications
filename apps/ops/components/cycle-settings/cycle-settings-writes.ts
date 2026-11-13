'use client';

// The Cycle settings page's live writes, called from the board (cycle-settings-board.tsx). Mock mode never calls these.
// Each wraps a server action in lib/cycle-settings-actions.ts (admin only, every field checked there) and gives up after
// 15 seconds: then the change may or may not have been saved, so the page says so and asks for a reload.
import { publishCycleNow, saveCycleFields, unpublishCycleNow, type FieldsResult } from '@/lib/cycle-settings-actions';
import type { CyclePatch } from '@/lib/cycle-settings-merge';

/** Every live call gives up after 15 seconds. */
export const LIMIT_MS = 15_000;
/** What the page says when no answer came in time. */
export const LATE = 'No answer in time. Reload to check.';

const late: FieldsResult = { ok: false, message: LATE };

// Resolves with `fallback` after LIMIT_MS unless `p` settles first (a thrown call counts as "no answer").
function within<T>(p: Promise<T>, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = window.setTimeout(() => resolve(fallback), LIMIT_MS);
    p.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      () => {
        window.clearTimeout(t);
        resolve(fallback);
      },
    );
  });
}

/** Saves one setting: `patch` the new values, `before` what the page showed for the same fields. */
export function saveFieldsLive(id: string, patch: CyclePatch, before: CyclePatch): Promise<FieldsResult> {
  return within(saveCycleFields(id, patch, before), late);
}

/** Publishes the draft. */
export function publishLive(id: string): Promise<FieldsResult> {
  return within(publishCycleNow(id), late);
}

/** Unpublishes the cycle. */
export function unpublishLive(id: string): Promise<FieldsResult> {
  return within(unpublishCycleNow(id), late);
}
