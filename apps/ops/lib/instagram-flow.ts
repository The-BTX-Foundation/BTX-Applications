// The Instagram board's decisions around its two writes, kept pure so they are unit tested (tests/instagram-flow.test.ts):
// what a send's result changes and says, what an add's result changes and says, which day a typed line is read
// against, and whether focus may move after an async write. The board (components/instagram/instagram-board.tsx) applies
// what these return.
import { easternDay } from './refresh-time';
import { monthOf } from './instagram-map';
import type { IgPerson, IgPost } from './instagram-view';

// ---------- The day ----------

/**
 * The day a typed line is read against: live mode reads the Eastern day again at the moment of submit (the page may have
 * stayed open past midnight); mock mode keeps the sample's day.
 */
export const submitDay = (live: boolean, today: string, now: Date = new Date()): string => (live ? easternDay(now.toISOString()) : today);

// ---------- Focus ----------

/**
 * Whether focus may move after a write that finished later (a send or an add). Never while the person is typing in a field
 * (they started something else); a move the person asked for with a click or a key always may.
 */
export const mayMoveFocus = (afterWrite: boolean, activeTag: string | undefined): boolean => !afterWrite || !['INPUT', 'TEXTAREA', 'SELECT'].includes((activeTag ?? '').toUpperCase());

/** Where Escape in the add line sends focus: back to the "Add a post" row it opened from. */
export const ESCAPE_FOCUS = '#ig-add-open';

// ---------- Send for approval ----------

/** A send's result: saved, matched no row (the post moved on: approved, scheduled or posted by someone else), or failed. */
export type SendResult = 'ok' | 'moved' | 'failed';

/** The done line's words once a post is sent. Live only sets the post's status (nobody is notified), so it says just that. */
export function sentWords(live: boolean, approver: IgPerson | null): string {
  if (live) return 'Marked as waiting for approval';
  return approver ? `Sent to ${approver.name} for approval` : 'Sent for board approval';
}

/** What the board does with a send's result. `patch` is null when nothing changes locally (the server's value stands). */
export type SendEffect = { patch: Partial<IgPost> | null; error: string | null; say: string; focus: string; refresh: boolean };

/** What a send's result changes, says and focuses. Live always refreshes, so whatever the server holds is what shows. */
export function sendEffect(result: SendResult, live: boolean, approver: IgPerson | null, at: string): SendEffect {
  if (result === 'ok') return { patch: { sent: true, sentAt: at }, error: null, say: sentWords(live, approver), focus: '[data-x="unsend"]|[data-row-sel]', refresh: live };
  const error = result === 'moved' ? 'That post has already moved on.' : "Couldn't save. Try again.";
  return { patch: null, error, say: error, focus: '[data-x="send"]|[data-row-sel]', refresh: live };
}

/**
 * Runs one send at most once at a time per post: a second tap while one is running is ignored ('busy'). `write` is the
 * real write (live) or the stand-in (mock).
 */
export async function runSend(id: string, busy: Set<string>, write: (id: string) => Promise<SendResult>): Promise<SendResult | 'busy'> {
  if (busy.has(id)) return 'busy';
  busy.add(id);
  try {
    return await write(id);
  } catch {
    return 'failed';
  } finally {
    busy.delete(id);
  }
}

// ---------- Add a post ----------

/** What the board does once an add returns: announce only after the row saved; a failed add keeps its words and its id. */
export type AddEffect = { saved: true; say: string; focus: string } | { saved: false; say: string; keepId: string | undefined; refresh: boolean };

/** What an add's result says and focuses. A failed live add refreshes, in case it saved and only the answer was lost. */
export function addEffect(r: { ok: boolean; id: string | undefined }, title: string, postOn: string | null, live: boolean, retry: boolean): AddEffect {
  if (r.ok) return { saved: true, say: `Added to ${monthOf(postOn)}`, focus: retry ? `#ig-row-${r.id}|.ig-unadded [data-na]|#ig-add-open|#ig-add-in` : '#ig-add-in|#ig-add-open' };
  return { saved: false, say: `Couldn't save. Try again. Not added: ${title}`, keepId: r.id, refresh: live };
}

/** The line under the add field when Enter is pressed with only a date or a name typed (no words left for the title). */
export const NEED_WORDS = 'Add a few words for the post.';

// ---------- Empty list ----------

/** The empty list's line: with posts possible, without an Instagram channel row (live), or read-only. */
export function emptyWords(canAdd: boolean, hasChannel: boolean): string {
  if (canAdd) return 'No posts yet. Add the first one.';
  if (!hasChannel) return 'The Instagram channel is not set up yet, so posts cannot be added.';
  return 'No posts yet.';
}
