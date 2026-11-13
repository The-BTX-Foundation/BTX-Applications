// The Newsletter page in LIVE mode: reads the real tables as the signed-in person (row-level security applies: admins and
// board members read the Outreach tables) through a reader (lib/newsletter-db.ts on the server; a stand-in in
// tests/newsletter-live.test.ts) and builds the page's shape with the pure mapping in lib/newsletter-map.ts.
//
// Reads, none of them all-time: the next unsent issue (one row), the newest sent issue (one row, for "Last issue"), that
// issue's sections (paged), the staff names (paged) and the Newsletter channel (one row, for the subscriber count).
// Core reads (issues, sections, staff) fail the issue panel: the page draws its designed load error. The channel read is
// optional: when it fails, only the subscriber fact says "Couldn't count" (a failed read is never a zero).
// Nothing here sends anything: there is no email tool and no subscriber list, so `caps.send` is always false live.
import { mapIssue, mapSections, lastIssueLabel, subscribersLabel, type NlStaff, type Row } from './newsletter-map';
import type { NlCaps, NlResult, NlView } from './newsletter-view';
import { easternDay } from './refresh-time';

/** One read's filters. `order` lists the sort columns; the last one must be unique for a paged read. */
export type NlReadOpts = { eq?: Record<string, unknown>; neq?: Record<string, unknown>; order?: [string, boolean][]; limit?: number };

/** How live mode reads: `rows` is one request (a read with a small `limit`); `all` pages through every matching row. */
export type NlReader = {
  rows: (table: string, select: string, o?: NlReadOpts) => Promise<Row[]>;
  all: (table: string, select: string, o: NlReadOpts) => Promise<Row[]>;
};

/** The signed-in person as the loader needs them (from requireStaff). */
export type NlUser = { id: string; role: string };

/** The tool the newsletter is sent from: not stored yet. */
export const NL_TOOL_LIVE = 'Not set';

/** The live capabilities: a section tick (and its Undo) for admins and board members, when the issue loaded. */
export function liveCaps(loaded: boolean, role: string): NlCaps {
  const staffRole = role === 'admin' || role === 'board';
  return {
    // newsletter_sections.status update: admins and board members may update it (row-level security, "team" tables).
    tick: loaded && staffRole,
    // Undo is the reverse status write (same table, same rule).
    undo: loaded && staffRole,
    // A nudge would be a Board chat message; the owner kept it off this page live (mock only).
    nudge: false,
    // Owner rule 3b: nothing may send the newsletter. Never true live.
    send: false,
    // Past issues have no screen (O14).
    pastIssues: false,
  };
}

// The staff names by user id (paged by user_id).
async function readStaff(r: NlReader): Promise<NlStaff> {
  const rows = await r.all('staff_profiles', 'user_id, display_name, initials', { order: [['user_id', true]] });
  return new Map(rows.map((p) => [String(p.user_id), { name: String(p.display_name ?? ''), initials: String(p.initials ?? '') }]));
}

// A read that, when it fails, throws `{ table, code }` only (no row data), so the one server log line names the table.
type Failed = { table: string; code: string };
function tagged<T>(table: string, p: Promise<T>): Promise<T> {
  return p.catch((e: unknown) => {
    const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : 'unknown';
    throw { table, code } satisfies Failed;
  });
}
const isFailed = (e: unknown): e is Failed => e != null && typeof e === 'object' && 'table' in e && 'code' in e;

/** Loads the live page. `now` is the server's clock (today's Eastern day is counted from it). */
export async function loadLiveNewsletter(r: NlReader, me: NlUser, now: Date = new Date()): Promise<NlResult> {
  const today = easternDay(now.toISOString());
  // Optional: the Newsletter channel (owner and subscriber count). A failure marks only the subscriber fact.
  const channelRead = tagged('outreach_channels', r.rows('outreach_channels', 'id, owner_id, audience_count', { eq: { kind: 'newsletter' }, order: [['position', true], ['id', true]], limit: 1 })).then(
    (rows) => ({ ok: true as const, channel: rows[0] as Row | undefined }),
    (e: Failed) => {
      console.error('[newsletter] channel read failed', { table: e.table, code: e.code });
      return { ok: false as const };
    },
  );
  try {
    const [nextIssues, lastSent, staff, ch] = await Promise.all([
      // The next issue not sent yet: the earliest send day (an issue with no day comes last), then id.
      tagged('newsletter_issues', r.rows('newsletter_issues', 'id, title, send_on, intro, owner_id, status', { neq: { status: 'sent' }, order: [['send_on', true], ['id', true]], limit: 1 })),
      // The newest sent issue, for "Last issue".
      tagged('newsletter_issues', r.rows('newsletter_issues', 'id, sent_at', { eq: { status: 'sent' }, order: [['sent_at', false], ['id', false]], limit: 1 })),
      tagged('staff_profiles', readStaff(r)),
      channelRead,
    ]);
    const row = nextIssues[0];
    const channel = ch.ok ? ch.channel : undefined;
    // Only this issue's sections, in position order (id breaks ties), paged.
    const sectionRows = row
      ? await tagged('newsletter_sections', r.all('newsletter_sections', 'id, position, title, blurb, owner_id, status, waits_until, waits_note', { eq: { issue_id: row.id }, order: [['position', true], ['id', true]] }))
      : [];
    const view: NlView = {
      today,
      issue: row ? mapIssue(row, staff, me.id, channel?.owner_id) : null,
      sections: mapSections(sectionRows, staff, me.id),
      facts: { subscribers: ch.ok ? subscribersLabel(channel) : null, lastIssue: lastIssueLabel(lastSent[0]?.sent_at), tool: NL_TOOL_LIVE },
      loadFailed: false,
      caps: liveCaps(row != null, me.role),
    };
    return { ...view, failed: false };
  } catch (e) {
    // One server line with the table and error code only (never row data).
    console.error('[newsletter] read failed', isFailed(e) ? { table: e.table, code: e.code } : { table: 'unknown', code: 'unknown' });
    // A core read failed: the title and the designed "Newsletter didn't load." card (never an empty issue).
    return {
      today,
      issue: null,
      sections: [],
      facts: { subscribers: null, lastIssue: 'None yet', tool: NL_TOOL_LIVE },
      loadFailed: true,
      caps: liveCaps(false, me.role),
      failed: false,
    };
  }
}
