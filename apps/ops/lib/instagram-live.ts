// Live mode: builds the Instagram view (lib/instagram-view.ts) as the signed-in person. The reads go through a reader
// (lib/instagram-db.ts: the session client, so row-level security applies), passed in so tests can stand in for the
// database (tests/instagram-live.test.ts). The mapping is pure (lib/instagram-map.ts).
//
// Posts are never read all-time: only the Instagram channel's posts dated this Eastern month or later, the undated ones,
// and older ones not posted yet (still open work). Every read is paged. A failed read is never "No posts yet": the page
// shows its load error.
import { easternDay } from './refresh-time';
import { igStaff, igTarget, liveCaps, mapIgPosts, type Row } from './instagram-map';
import type { IgResult, IgView } from './instagram-view';

/** Which posts one read asks for. */
export type PostFilter = { from: string } | { undated: true } | { openBefore: string };

/** The reads live mode needs. Each one returns every matching row (paged) or throws. */
export type IgReader = {
  /** The Instagram channel (kind 'instagram', first by position), or null when there is none. */
  channel: () => Promise<Row | null>;
  posts: (channelId: string, filter: PostFilter) => Promise<Row[]>;
  staff: () => Promise<Row[]>;
};

/** The columns the page reads. */
export const POST_COLS = 'id, channel_id, title, post_on, owner_id, caption, image_path, status, status_note, posted_at';

/** The view live mode shows when a read fails: the title and the "Instagram didn't load." card. */
export function failedIgView(today: string, me: string | null): IgView {
  return { today, target: null, channelId: null, posts: [], staff: [], me, caps: liveCaps(false), loadFailed: true, mockWrite: null };
}

/** Reads the channel, its posts and the board, and returns the view (loadFailed when any read throws). `now` is for tests. */
export async function loadLiveIgView(read: IgReader, me: string | null, now = new Date()): Promise<IgResult> {
  const today = easternDay(now.toISOString());
  const monthStart = `${today.slice(0, 7)}-01`;
  try {
    const [channel, staffRows] = await Promise.all([read.channel(), read.staff()]);
    const staff = igStaff(staffRows);
    const channelId = channel ? String(channel.id) : null;
    let rows: Row[] = [];
    if (channelId) {
      const [ahead, undated, open] = await Promise.all([read.posts(channelId, { from: monthStart }), read.posts(channelId, { undated: true }), read.posts(channelId, { openBefore: monthStart })]);
      rows = [...ahead, ...undated, ...open];
    }
    const view: IgView = { today, target: channel ? igTarget(channel.target) : null, channelId, posts: mapIgPosts(rows, staff), staff, me, caps: liveCaps(!!channelId), loadFailed: false, mockWrite: null };
    return { ...view, failed: false };
  } catch (err) {
    // One server line with the table and the error code only (lib/instagram-db.ts throws { table, code }).
    const e = (err ?? {}) as { table?: unknown; code?: unknown };
    console.error('[instagram] read failed', { table: typeof e.table === 'string' ? e.table : 'unknown', code: typeof e.code === 'string' ? e.code : 'unknown' });
    return { ...failedIgView(today, me), failed: false };
  }
}
