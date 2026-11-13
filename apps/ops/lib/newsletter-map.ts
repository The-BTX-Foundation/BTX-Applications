// Pure logic of the Newsletter page (unit tested in tests/newsletter-map.test.ts; no database and no clock here): mapping the
// live rows to the page's shape (lib/newsletter-view.ts), the next section, the news card, the plain-word dates, the drafted
// nudge, the status a write sends, the paged read and the per-section write queue.
import type { NlIssue, NlOwner, NlSection, NlStatus } from './newsletter-view';
import { daysFrom, shortDate, weekday } from './refresh-time';

/** One database row as PostgREST returns it. */
export type Row = Record<string, unknown>;
/** Staff names by user id. */
export type NlStaff = Map<string, { name: string; initials: string }>;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// A value as text ('' for null or undefined).
const str = (v: unknown): string => (v == null ? '' : String(v));

/** Initials from a name, as the demo draws them: the first letters of the capitalized words, at most two ("Dana Mercer" -> "DM"). */
export function nlInitials(name: string): string {
  return name
    .split(/[\s-]+/)
    .filter((w) => /^[A-Z]/.test(w))
    .map((w) => w[0])
    .slice(0, 2)
    .join('');
}

/** The first name ("Toby Faraday" -> "Toby"). */
export function firstName(name: string): string {
  return name.split(' ')[0];
}

/** A person for an owner id, or null when the id is empty or unknown. `meId` marks the signed-in person. */
export function ownerOf(id: unknown, staff: NlStaff, meId: string): NlOwner | null {
  const key = str(id);
  const p = key ? staff.get(key) : undefined;
  if (!p || !p.name) return null;
  return { name: p.name, initials: p.initials || nlInitials(p.name), mine: key === meId };
}

/** A stored status, read safely (anything unknown counts as not started). */
export function statusOf(v: unknown): NlStatus {
  return v === 'done' || v === 'writing' ? v : 'not_started';
}

/** The issue's sections from `newsletter_sections` rows (already in position order). */
export function mapSections(rows: Row[], staff: NlStaff, meId: string): NlSection[] {
  return rows.map((r) => ({
    id: str(r.id),
    title: str(r.title),
    blurb: str(r.blurb),
    status: statusOf(r.status),
    owner: ownerOf(r.owner_id, staff, meId),
    waits: r.waits_until ? str(r.waits_until).slice(0, 10) : null,
    waitNote: r.waits_note ? str(r.waits_note) : null,
  }));
}

/** "2026-11-30" -> "November". */
export function monthOf(day: string): string {
  return MONTHS[Number(day.slice(5, 7)) - 1] ?? '';
}

/** The issue from its `newsletter_issues` row; the owner is the issue's, else the Newsletter channel's. */
export function mapIssue(row: Row, staff: NlStaff, meId: string, channelOwner: unknown): NlIssue {
  const sendOn = row.send_on ? str(row.send_on).slice(0, 10) : null;
  const title = str(row.title);
  const month = sendOn ? monthOf(sendOn) : null;
  return {
    heading: month ? `${month} issue` : title,
    month,
    previewTitle: title,
    intro: str(row.intro),
    sendOn,
    owner: ownerOf(row.owner_id, staff, meId) ?? ownerOf(channelOwner, staff, meId),
  };
}

/** "Last issue": the month and year the newest sent issue went out, in Eastern time ("October 2026"), or "None yet". */
export function lastIssueLabel(sentAt: unknown): string {
  if (!sentAt) return 'None yet';
  const d = new Date(str(sentAt));
  if (Number.isNaN(d.getTime())) return 'None yet';
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'America/New_York' });
}

/** Subscribers as stored on the Newsletter channel (`audience_count`), or "Not set". */
export function subscribersLabel(channel: Row | undefined): string {
  const n = channel?.audience_count;
  return typeof n === 'number' && Number.isFinite(n) ? String(n) : 'Not set';
}

/**
 * The demo's plain-word date for a waiting section: a past day reads as its date ("Mon Nov 2"), then Today, Tomorrow, a
 * weekday up to 5 days out, "Next Sat" up to 12 days out, and the date after that.
 */
export function waitWord(today: string, day: string): string {
  const n = daysFrom(today, day);
  if (n < 0) return shortDate(day);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n <= 5) return weekday(day);
  if (n <= 12) return `Next ${weekday(day)}`;
  return shortDate(day);
}

/** True when a section still waits on a later day (it cannot be written yet). */
export function isWaiting(s: NlSection, today: string): boolean {
  return s.waits != null && daysFrom(today, s.waits) > 0;
}

/** True when the section is done. */
export const isDone = (s: NlSection): boolean => s.status === 'done';

/**
 * The next section to write: the pinned one while it is open (mock sample only), else the first open section that is not
 * waiting on a later day; null when none.
 */
export function nextSection(sections: NlSection[], pinned: string | null, today: string): NlSection | null {
  const open = sections.filter((s) => !isDone(s));
  return open.find((s) => s.id === pinned) ?? open.find((s) => !isWaiting(s, today)) ?? null;
}

/** How many sections are done, of how many. */
export function progress(sections: NlSection[]): { done: number; total: number } {
  return { done: sections.filter(isDone).length, total: sections.length };
}

/** True when the issue has sections and every one is done. */
export function allDone(sections: NlSection[]): boolean {
  return sections.length > 0 && sections.every(isDone);
}

/** The news card: what is next on the issue. `id` is a section id, or 'send' for the sending box. */
export type NlNews = { id: string; kicker: string; title: string; icon: 'pen' | 'mail' | 'wait'; gold: boolean };

/** The news card for the page (null when there is nothing to show: no sections, or the issue was just sent). */
export function newsFor(sections: NlSection[], pinned: string | null, today: string, previewTitle: string, sent: boolean): NlNews | null {
  if (!sections.length || sent) return null;
  if (allDone(sections)) return { id: 'send', kicker: 'Ready to send', title: previewTitle, icon: 'mail', gold: true };
  const n = nextSection(sections, pinned, today);
  if (n) {
    const mine = !n.owner || n.owner.mine;
    const kicker = !n.owner ? 'Next section · no owner' : n.owner.mine ? 'Next section · yours' : `Next section · ${firstName(n.owner.name)}`;
    return { id: n.id, kicker, title: n.title, icon: 'pen', gold: mine };
  }
  // Every open section waits on a later day: the first one, with its day.
  const w = sections.find((s) => !isDone(s));
  if (!w) return null;
  return { id: w.id, kicker: w.waits ? `Waits until ${shortDate(w.waits)}` : 'Waiting', title: w.title, icon: 'wait', gold: false };
}

/** The drafted Board chat nudge to a section's owner (mock only). */
export function nudgeText(ownerName: string, month: string | null, sendOn: string | null, title: string): string {
  const which = month ? `the ${month} newsletter` : 'the newsletter';
  const when = sendOn ? ` goes out ${shortDate(sendOn)}` : ' goes out soon';
  return `Hi ${firstName(ownerName)}, ${which}${when}. How is the "${title}" section coming along?`;
}

/** The sending line while sections are open: "Sends Mon Nov 30 once the last 4 sections are done" (date part separate). */
export function leftWords(left: number): string {
  return left === 1 ? 'section is' : `${left} sections are`;
}

/** The sections with the page's local statuses laid over the server's (`over`: section id -> status). */
export function withStatus(sections: NlSection[], over: Readonly<Record<string, NlStatus>>): NlSection[] {
  return sections.map((s) => (s.id in over && over[s.id] !== s.status ? { ...s, status: over[s.id] } : s));
}

/** The signature of the server's sections: a change means fresh data to take in. */
export function sectionsSig(sections: NlSection[]): string {
  return sections.map((s) => `${s.id}:${s.status}:${s.title}:${s.owner?.name ?? ''}:${s.waits ?? ''}`).join('|');
}

/**
 * The status an untick writes: the open status the section had before this page ticked it (so a 'writing' section goes back
 * to 'writing'), else 'not_started' (a section that was already done when the page loaded).
 */
export function reopenStatus(prevOpen: Readonly<Record<string, NlStatus>>, id: string): NlStatus {
  const p = prevOpen[id];
  return p === 'writing' || p === 'not_started' ? p : 'not_started';
}

/** The mock clock: the demo's 9:14 AM plus one minute per action (`n` actions so far). */
export function mockClock(n: number): string {
  const m = 9 * 60 + 14 + n;
  return `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, '0')} ${m < 720 ? 'AM' : 'PM'}`;
}

/** Rows per request (the database API's silent cap) and the most pages one read may take. */
export const NL_PAGE = 1000;
export const NL_MAX_PAGES = 20;

/**
 * Reads every row through `fetchPage(from, to)` (inclusive positions, as `.range()` takes them). Each page starts after
 * the rows read so far (the server may return fewer than asked); only an empty page ends the read; a read still going at
 * the ceiling throws (the page shows its load error, never partial data).
 */
export async function nlPaged<T>(fetchPage: (from: number, to: number) => Promise<T[]>, size = NL_PAGE, max = NL_MAX_PAGES): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < max; p++) {
    const rows = await fetchPage(out.length, out.length + size - 1);
    if (rows.length === 0) return out;
    out.push(...rows);
  }
  throw new Error(`Read reached ${max} pages; refusing partial data.`);
}

/**
 * Runs `write` after every earlier write queued on the same key (whether it worked or not), so two writes to one section
 * reach the database in the order the person made them. Returns the write's own promise.
 */
export function chain<T>(queue: Map<string, Promise<unknown>>, k: string, write: () => Promise<T>): Promise<T> {
  const prev = queue.get(k) ?? Promise.resolve();
  const next = prev.then(write, write);
  queue.set(k, next);
  return next;
}

/** "Oct 30" (same year as today) or "Oct 30, 2025" (another year), from `YYYY-MM-DD` strings (never parsed as UTC). */
export function monthDay(today: string, day: string): string {
  const m = (MONTHS[Number(day.slice(5, 7)) - 1] ?? '').slice(0, 3);
  const year = day.slice(0, 4) === today.slice(0, 4) ? '' : `, ${day.slice(0, 4)}`;
  return `${m} ${Number(day.slice(8, 10))}${year}`;
}

/**
 * The sending line while sections are still open. A send day before today (Eastern) shows in the house late style,
 * "Planned for Oct 30, passed" (the issue was likely sent outside the Hub and never marked sent). Otherwise mock keeps the
 * demo's "Sends Mon Nov 30 once the last 2 sections are done"; live says "Goes out Mon Nov 30, sent outside the Ops Hub"
 * (this page cannot send).
 */
export function sendLine(today: string, sendOn: string | null, live: boolean, left: number): { late: boolean; text: string } {
  if (sendOn && sendOn < today) return { late: true, text: `Planned for ${monthDay(today, sendOn)}, passed` };
  if (live) return { late: false, text: sendOn ? `Goes out ${shortDate(sendOn)}, sent outside the Ops Hub` : 'Sent outside the Ops Hub' };
  return { late: false, text: `Sends ${sendOn ? `${shortDate(sendOn)} ` : ''}once the last ${leftWords(left)} done` };
}

/**
 * A settled status write. A refused write that is still the newest on its section drops the local status, so the server's
 * value wins; an older write (a newer one followed) or a write that went through changes nothing.
 */
export function settleWrite(over: Readonly<Record<string, NlStatus>>, id: string, ok: boolean, newest: boolean): Record<string, NlStatus> {
  if (ok || !newest || !(id in over)) return over as Record<string, NlStatus>;
  const next = { ...over };
  delete next[id];
  return next;
}

/** A write the page reported as refused: the section and the status it tried to save. */
export type NlSaveErr = { id: string; status: NlStatus } | null;

/**
 * New server data arrived (its signature changed): the local statuses are dropped, and a "Couldn't save" line goes away
 * when the server now holds the status that write tried to save (it committed after all).
 */
export function reseed(server: readonly NlSection[], err: NlSaveErr): { over: Record<string, NlStatus>; err: NlSaveErr } {
  const committed = err != null && server.some((s) => s.id === err.id && s.status === err.status);
  return { over: {}, err: committed ? null : err };
}

/** What Undo writes back: exactly the status the section had before the tick. */
export function undoStatus(recent: { was: NlStatus }): NlStatus {
  return recent.was;
}
