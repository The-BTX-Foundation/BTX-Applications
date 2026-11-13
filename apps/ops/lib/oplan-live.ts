// Live mode: builds the Outreach Plan view (lib/oplan-view.ts) from the real tables as the signed-in person. The reads go
// through a reader (lib/oplan-db.ts: the session client, so row-level security applies), passed in so tests can stand in
// for the database (tests/oplan-live.test.ts). The mapping is pure (lib/oplan-map.ts).
//
// The page shows this month and next, so posts and issues are read only for that window (plus the undated ones not yet
// posted or sent), never all-time; every read pages (lib/oplan-db.ts) and the sections are read 100 issues at a time.
// Every read is core: when any fails, the page shows the header and "Outreach plan didn't load." (a failed read is
// never drawn as an empty plan).
import { chunks } from './calendar-paging';
import { liveCaps, liveChannels, liveItems, livePeople } from './oplan-map';
import { monthKey, nextMonthKey } from './oplan-time';
import { easternDay } from './refresh-time';
import type { PnResult, PnView } from './oplan-view';

type Row = Record<string, unknown>;

/** Filters and order for one read. `order` lists the columns that make the order unique (paging needs it). */
export type PnReadOpts = {
  eq?: Record<string, unknown>;
  neq?: Record<string, unknown>;
  in?: Record<string, unknown[]>;
  gte?: Record<string, unknown>;
  lt?: Record<string, unknown>;
  /** Columns that must be null. */
  isNull?: string[];
  order: [string, boolean][];
};

/** How live mode reads: every matching row, in pages (throws when the database says no or the ceiling is reached). */
export type PnReader = { all: (table: string, select: string, o: PnReadOpts) => Promise<Row[]> };

const POST_COLS = 'id, channel_id, title, post_on, owner_id, caption, image_path, status, status_note';
const ISSUE_COLS = 'id, title, send_on, owner_id, status';

/** The view live mode shows when a read fails: the header and the "didn't load" card, nothing else. */
export function failedView(today: string, me: string): PnView {
  return { today, me, people: [], items: [], channels: [], instagramId: null, loadFailed: true, caps: { ...liveCaps(), addPost: false, parse: false } };
}

/** The first day of this month and the first day of the month after next ("2026-11-01", "2027-01-01"). */
export function windowOf(today: string): { from: string; to: string } {
  const now = monthKey(today);
  return { from: `${now}-01`, to: `${nextMonthKey(nextMonthKey(now))}-01` };
}

/** Reads the real tables and returns the Outreach Plan view (loadFailed when any read fails). `now` is for tests. */
export async function loadLiveOplanView(read: PnReader, me: string, now = new Date()): Promise<PnResult> {
  const today = easternDay(now.toISOString());
  const { from, to } = windowOf(today);
  try {
    const [staffRows, chanRows, datedPosts, undatedPosts, datedIssues, undatedIssues] = await Promise.all([
      read.all('staff_profiles', 'user_id, display_name, initials', { order: [['user_id', true]] }),
      read.all('outreach_channels', 'id, name, kind, target, status, status_note, owner_id, position', {
        order: [
          ['position', true],
          ['id', true],
        ],
      }),
      read.all('posts', POST_COLS, {
        gte: { post_on: from },
        lt: { post_on: to },
        order: [
          ['post_on', true],
          ['id', true],
        ],
      }),
      read.all('posts', POST_COLS, { isNull: ['post_on'], neq: { status: 'posted' }, order: [['id', true]] }),
      read.all('newsletter_issues', ISSUE_COLS, {
        gte: { send_on: from },
        lt: { send_on: to },
        order: [
          ['send_on', true],
          ['id', true],
        ],
      }),
      read.all('newsletter_issues', ISSUE_COLS, { isNull: ['send_on'], neq: { status: 'sent' }, order: [['id', true]] }),
    ]);
    const issues = [...datedIssues, ...undatedIssues];
    const ids = issues.map((i) => String(i.id));
    const sections = (await Promise.all(chunks(ids).map((c) => read.all('newsletter_sections', 'id, issue_id, status', { in: { issue_id: c }, order: [['id', true]] })))).flat();
    const items = liveItems([...datedPosts, ...undatedPosts], issues, sections);
    const channels = liveChannels(chanRows, items, today);
    return {
      today,
      me,
      people: livePeople(staffRows),
      items,
      channels,
      instagramId: channels.find((c) => c.kind === 'instagram')?.id ?? null,
      loadFailed: false,
      caps: liveCaps(),
      failed: false,
    };
  } catch {
    return { ...failedView(today, me), failed: false };
  }
}
