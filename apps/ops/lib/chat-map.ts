// The Board chat page's pure logic (no reads, no React), unit-tested in tests/chat-map.test.ts:
// - chatPeople, mapChannels, mapMessages, settleUnread, mapPins: the live tables' rows -> the page's view (lib/chat-view.ts);
// - the counting the page does: unread per channel, the "N new" line, the news card, read markers;
// - the thread: messages grouped by day and by person, and a message's text split into its drawn parts.
import { daysFrom, easternDay, fullDate, shortDate, weekday } from './refresh-time';
import type { ChatChannel, ChatMessage, ChatPerson, ChatPin } from './chat-view';

/** The "All areas" view's key. */
export const ALL = 'all';
/** Two messages from one person in one channel within this many ms share one avatar and name. */
const RUN_MS = 2 * 3600_000;

/** "99+" above 99, the number otherwise. */
export function countLabel(n: number): string {
  return n > 99 ? '99+' : String(n);
}

/** "Tue, Nov 10" for the title line. */
export function dateLabel(today: string): string {
  return `${weekday(today)}, ${shortDate(today).slice(4)}`;
}

/** The day divider's words: "Today", "Yesterday", or "Mon Nov 9" (counted in Eastern calendar days from `today`). */
export function dayLabel(today: string, instant: string): string {
  const n = daysFrom(today, easternDay(instant));
  if (n === 0) return 'Today';
  if (n === -1) return 'Yesterday';
  return shortDate(easternDay(instant));
}

/** "Tuesday, November 10" for a message time's hover title. */
export function dayTitle(instant: string): string {
  return fullDate(easternDay(instant));
}

// True when a message counts as unread for the viewer: someone else wrote it after the channel was last read.
function isUnread(m: ChatMessage, lastReadAt: string | null, me: string): boolean {
  if (m.authorId === me) return false;
  return lastReadAt === null || compareAt(m.createdAt, lastReadAt) > 0;
}

/** Matches the seconds' decimal point and its digits in an ISO instant. */
const FRACTION = /(:\d{2})\.(\d+)/;

// The digits after the seconds' decimal point, padded to nanoseconds ("" counts as 0).
function fraction(at: string): string {
  return (FRACTION.exec(at)?.[2] ?? '').padEnd(9, '0').slice(0, 9);
}

// The instant's whole second in milliseconds since 1970 (the fraction is cut off first, so no engine rounds it).
function wholeSecond(at: string): number {
  return Date.parse(at.replace(FRACTION, '$1'));
}

/**
 * Compares two ISO instants exactly, microseconds included (the database keeps them; a Date keeps only milliseconds):
 * negative when `a` is earlier, 0 when equal, positive when later. The whole seconds compare as dates (offsets
 * applied), then the fraction digits as text padded to nine places.
 */
export function compareAt(a: string, b: string): number {
  const d = wholeSecond(a) - wholeSecond(b);
  if (d) return d;
  const fa = fraction(a);
  const fb = fraction(b);
  return fa < fb ? -1 : fa > fb ? 1 : 0;
}

/** How far past the server's `now` a read stamp may go: `now` is taken before the reads, so a message saved while the page loaded still counts. */
export const STAMP_GRACE_MS = 5 * 60_000;

/** The latest a read stamp may be: the server's `now` plus the grace. */
export function stampCap(now: string): string {
  return new Date(Date.parse(now) + STAMP_GRACE_MS).toISOString();
}

/** A channel's unread count: the loaded unread messages plus the ones too old to be loaded. */
export function unreadOf(c: ChatChannel, messages: ChatMessage[], me: string): number {
  if (!c.id) return 0;
  const n = messages.filter((m) => m.channelId === c.id && isUnread(m, c.lastReadAt, me)).length;
  return n + c.unreadExtra;
}

/** The unread total across the area channels (the All areas pill and the news card; direct chats have their own pills). */
export function totalUnread(channels: ChatChannel[], messages: ChatMessage[], me: string): number {
  return channels.filter((c) => c.kind === 'area').reduce((s, c) => s + unreadOf(c, messages, me), 0);
}

/** The channel ids a view shows: every area channel for All areas, else the one channel (none for an unopened direct chat). */
export function viewIds(channels: ChatChannel[], sel: string): string[] {
  if (sel === ALL) return channels.filter((c) => c.kind === 'area' && c.id).map((c) => c.id as string);
  const c = channels.find((x) => x.key === sel);
  return c?.id ? [c.id] : [];
}

/** Where the "N new" line goes in a view: before the first unread message, with the view's unread count. */
export function splitFor(channels: ChatChannel[], messages: ChatMessage[], ids: string[], me: string): { firstId: string; count: number } | null {
  const last = new Map(channels.map((c) => [c.id, c.lastReadAt]));
  const un = messages.filter((m) => ids.includes(m.channelId) && isUnread(m, last.get(m.channelId) ?? null, me));
  if (!un.length) return null;
  const extra = channels.filter((c) => c.id && ids.includes(c.id)).reduce((s, c) => s + c.unreadExtra, 0);
  return { firstId: un[0].id, count: un.length + extra };
}

/** Read times to store, by channel id. */
export type Stamps = Record<string, string>;

// The later of two ISO instants (null counts as the earliest), as given.
function later(a: string | null, b: string): string {
  return a !== null && compareAt(a, b) > 0 ? a : b;
}

/** True for a message the database has saved and sent back: not one still sending (`pending`) or drawn locally. */
export function isServerMessage(m: ChatMessage): boolean {
  return !m.pending && !m.id.startsWith('local-');
}

/**
 * The newest SERVER message loaded in a channel, capped at the server's `now`; null when none is loaded. Messages still
 * sending and failed ones never count, and a message dated ahead of the server's clock never pushes a stamp past it.
 */
export function newestServerAt(messages: ChatMessage[], channelId: string, now: string): string | null {
  let best: string | null = null;
  for (const m of messages) if (m.channelId === channelId && isServerMessage(m) && (best === null || compareAt(m.createdAt, best) > 0)) best = m.createdAt;
  if (best === null) return null;
  const cap = stampCap(now);
  return compareAt(best, cap) > 0 ? cap : best;
}

/**
 * Live read times when channels open, never from the browser's clock: each channel at its newest loaded server message,
 * or at the server's `now` (the view's) when none is loaded; never later than `now`. A stamp never moves a channel's
 * marker backwards (the current marker is kept when it is later).
 */
export function readStamps(channels: ChatChannel[], messages: ChatMessage[], ids: string[], now: string): Stamps {
  const out: Stamps = {};
  for (const id of ids) out[id] = keepLater(channels, id, newestServerAt(messages, id, now) ?? now);
  return out;
}

/** `stamps` with each one raised to the channel's current marker if that is later (a marker never moves backwards). */
export function laterStamps(channels: ChatChannel[], stamps: Stamps): Stamps {
  return Object.fromEntries(Object.entries(stamps).map(([id, at]) => [id, keepLater(channels, id, at)]));
}

// A stamp for one channel, raised to its current marker if that is later.
function keepLater(channels: ChatChannel[], id: string, at: string): string {
  return later(channels.find((c) => c.id === id)?.lastReadAt ?? null, at);
}

/** The channels with `ids` marked read at `at` (their unread extra cleared). */
export function markReadLocal(channels: ChatChannel[], ids: string[], at: string): ChatChannel[] {
  return markStamps(channels, Object.fromEntries(ids.map((id) => [id, at])));
}

/** The channels marked read at their own stamps (their unread extra cleared); channels without a stamp stay as they are. */
export function markStamps(channels: ChatChannel[], stamps: Stamps): ChatChannel[] {
  return channels.map((c) => (c.id && stamps[c.id] !== undefined ? { ...c, lastReadAt: stamps[c.id], unreadExtra: 0 } : c));
}

/** True when any channel the view shows was read only up to its cap (older messages exist that are not loaded). */
export function viewCapped(capped: string[], ids: string[]): boolean {
  return ids.some((id) => capped.includes(id));
}

/**
 * Where a view's timeline starts so no channel in it has a hidden gap: the LATEST "oldest loaded message" among its
 * capped channels (earlier messages of the other channels are left out with them). Null when no channel in it is capped.
 */
export function viewStart(messages: ChatMessage[], capped: string[], ids: string[]): string | null {
  let start: string | null = null;
  for (const id of ids) {
    if (!capped.includes(id)) continue;
    let oldest: string | null = null;
    for (const m of messages) if (m.channelId === id && isServerMessage(m) && (oldest === null || compareAt(m.createdAt, oldest) < 0)) oldest = m.createdAt;
    if (oldest !== null && (start === null || compareAt(oldest, start) > 0)) start = oldest;
  }
  return start;
}

/** True when a message is at or after a view's start (always, when the view has none). */
export function afterStart(m: ChatMessage, start: string | null): boolean {
  return start === null || compareAt(m.createdAt, start) >= 0;
}

/**
 * What a view shows and may mark read. A view with a start (All areas with a capped channel) shows only the messages at
 * or after it (`messages`, and `ids`: the channels with a server message there, for the "N new" line). It marks read
 * (`stampIds`) only the channels shown there with NONE of their unread messages hidden before the start: a channel with
 * an unread message the person cannot see keeps its badge (opening that channel itself shows it). Without a start,
 * everything loaded counts and every channel of the view may be marked read.
 */
export function viewScope(
  channels: ChatChannel[],
  messages: ChatMessage[],
  capped: string[],
  ids: string[],
  all: boolean,
  me: string,
): { messages: ChatMessage[]; ids: string[]; stampIds: string[] } {
  const start = all ? viewStart(messages, capped, ids) : null;
  if (start === null) return { messages, ids, stampIds: ids };
  const shown = messages.filter((m) => afterStart(m, start));
  const shownIds = ids.filter((id) => shown.some((m) => m.channelId === id && isServerMessage(m)));
  const last = new Map(channels.map((c) => [c.id, c.lastReadAt]));
  const hiddenUnread = (id: string) => messages.some((m) => m.channelId === id && !afterStart(m, start) && isUnread(m, last.get(id) ?? null, me));
  return { messages: shown, ids: shownIds, stampIds: shownIds.filter((id) => !hiddenUnread(id)) };
}

/* ---------- composing: one draft per view; a new message always gets its own new id ---------- */

/** The composer's drafts, one per view key (All areas, an area channel, a direct conversation). */
export type Drafts = Record<string, string>;

/** The draft for a view ("" when none): text typed in one view is never shown, or sent, in another. */
export function draftFor(drafts: Drafts, key: string): string {
  return drafts[key] ?? '';
}

/** `drafts` with one view's draft set (an empty one is dropped). */
export function withDraft(drafts: Drafts, key: string, text: string): Drafts {
  const next = { ...drafts };
  if (text) next[key] = text;
  else delete next[key];
  return next;
}

type IdSource = { randomUUID?: () => string; getRandomValues: <T extends Uint8Array>(a: T) => T };

/**
 * A new message id (a v4 UUID): crypto.randomUUID where the browser has it, else built from crypto.getRandomValues. Every
 * new send gets a new id, even when its words match an earlier message; only Retry on a Not-sent row reuses that row's id.
 */
export function newMessageId(c: IdSource = globalThis.crypto): string {
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** True when an insert error is Postgres's unique violation (23505): the row with that id is already saved. */
export function isDuplicateInsert(error: unknown): boolean {
  return Boolean(error) && typeof error === 'object' && String((error as { code?: unknown }).code) === '23505';
}

/** True the first time a message id is seen (and remembers it): the push for a message goes out once. */
export function firstPush(pushed: Set<string>, id: string): boolean {
  if (pushed.has(id)) return false;
  pushed.add(id);
  return true;
}

/** True when a refresh brought messages someone else wrote that were not on the page before. */
export function newFromOthers(before: ChatMessage[], after: ChatMessage[], me: string): boolean {
  const had = new Set(before.map((m) => m.id));
  return after.some((m) => m.authorId !== me && !had.has(m.id));
}

/** The news card under the title: the area with the most unread (not the one already open with its "new" line), or none. */
export function nextUp(channels: ChatChannel[], messages: ChatMessage[], me: string, sel: string, hasDivider: boolean): { key: string; kicker: string; title: string } | null {
  const n = totalUnread(channels, messages, me);
  if (!n || !messages.length) return null;
  const cands = channels.filter((c) => c.kind === 'area' && unreadOf(c, messages, me) > 0 && !(sel === c.key && hasDivider));
  // Most unread first; ties keep the list order (sort is stable).
  const pick = [...cands].sort((x, y) => unreadOf(y, messages, me) - unreadOf(x, messages, me))[0];
  if (!pick) return null;
  return { key: pick.key, kicker: `${countLabel(n)} new`, title: pick.name };
}

/** True when a message belongs in the view: every area channel for All areas, else the open channel only. */
export function inView(m: ChatMessage, sel: string, channels: ChatChannel[]): boolean {
  if (sel === ALL) return channels.some((c) => c.kind === 'area' && c.id === m.channelId);
  const c = channels.find((x) => x.key === sel);
  return Boolean(c?.id) && c?.id === m.channelId;
}

/** The messages a search keeps: the words in the text or the writer's name ("BTX" for system messages). */
export function matches(m: ChatMessage, q: string, names: Map<string, string>): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const who = m.isBot || !m.authorId ? 'BTX' : (names.get(m.authorId) ?? '');
  return `${m.body} ${who}`.toLowerCase().includes(s);
}

/** One drawn thing in the thread. */
export type ThreadItem =
  | { kind: 'day'; key: string; label: string; title: string }
  | { kind: 'new'; key: string; count: number }
  | { kind: 'group'; key: string; authorId: string | null; channelId: string; lines: ChatMessage[] };

/**
 * The thread in drawing order: a day divider whenever the Eastern day changes, the "N new" line before the first unread
 * message (not while searching), and runs of messages from one person in one channel within two hours as one group.
 */
export function buildThread(visible: ChatMessage[], today: string, divider: { firstId: string; count: number } | null): ThreadItem[] {
  const out: ThreadItem[] = [];
  let day = '';
  let g: Extract<ThreadItem, { kind: 'group' }> | null = null;
  let lastAt = 0;
  for (const m of visible) {
    const dk = easternDay(m.createdAt);
    if (dk !== day) {
      g = null;
      out.push({ kind: 'day', key: `d-${dk}`, label: dayLabel(today, m.createdAt), title: fullDate(dk) });
      day = dk;
    }
    if (divider && divider.firstId === m.id) {
      g = null;
      out.push({ kind: 'new', key: 'new', count: divider.count });
    }
    const at = Date.parse(m.createdAt);
    const same = g !== null && g.authorId === m.authorId && g.channelId === m.channelId && at - lastAt <= RUN_MS;
    if (!same || !g) {
      g = { kind: 'group', key: `g-${m.id}`, authorId: m.authorId, channelId: m.channelId, lines: [] };
      out.push(g);
    }
    g.lines.push(m);
    lastAt = at;
  }
  return out;
}

/** One piece of a message's text: plain text, a piece that never breaks, or a web address that may break after a slash. */
export type BodyPart = { text: string; bold: boolean; kind: 'text' | 'nowrap' | 'url' };

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A message's text split for drawing: "**bold**" parts; applicant codes ("APP-2026-00013"), amounts in brackets
 * ("($4,830)") and people's names kept on one line; web addresses marked so the page lets them break after each slash.
 */
export function bodyParts(text: string, names: string[] = []): BodyPart[] {
  const alts = ['https?:\\/\\/\\S+', 'APP-\\d{4}-\\d{5}', '\\(\\$[\\d,]+\\)', ...names.filter(Boolean).sort((a, b) => b.length - a.length).map(esc)];
  const rx = new RegExp(`(${alts.join('|')})`, 'g');
  const out: BodyPart[] = [];
  text.split(/\*\*(.+?)\*\*/).forEach((chunk, i) => {
    const bold = i % 2 === 1;
    // split() with a capture group puts the matches at the odd indexes.
    chunk.split(rx).forEach((p, k) => {
      if (!p) return;
      if (k % 2 === 0) out.push({ text: p, bold, kind: 'text' });
      else out.push({ text: p, bold, kind: /^https?:/.test(p) ? 'url' : 'nowrap' });
    });
  });
  return out;
}

// ---------- Live mapping: the tables' rows -> the view ----------

type Row = Record<string, unknown>;

/** The rows lib/chat-live.ts reads (as the signed-in person, so row-level security has already filtered them). */
export type ChatRows = {
  profiles: Row[];
  /** staff_directory(): user_id, role. */
  directory: Row[];
  channels: Row[];
  unread: Row[];
  markers: Row[];
  pins: Row[];
  areas: Row[];
  /** Newest first, as read. */
  messages: Row[];
};

/** The people who can be in the chat: admins and board members with a profile, in profile order. */
export function chatPeople(rows: Pick<ChatRows, 'profiles' | 'directory'>): ChatPerson[] {
  const inChat = new Set(rows.directory.filter((r) => r.role === 'admin' || r.role === 'board').map((r) => String(r.user_id)));
  return rows.profiles
    .filter((p) => inChat.has(String(p.user_id)))
    .map((p) => ({ userId: String(p.user_id), displayName: String(p.display_name ?? ''), initials: String(p.initials ?? '') }));
}

/** The direct channel key two people share (the database's direct_key: both ids sorted, joined by a colon). */
export function directKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}

/**
 * The channel list: the area channels in the areas' order, then a direct entry for every other board member (with the
 * channel's id once it exists). Only channels the viewer can read are in `rows.channels`, so nothing else is listed.
 */
export function mapChannels(rows: Pick<ChatRows, 'channels' | 'unread' | 'markers' | 'areas'>, people: ChatPerson[], me: string): ChatChannel[] {
  const unreadBy = new Map(rows.unread.map((u) => [String(u.channel_id), Number(u.unread) || 0]));
  const readBy = new Map(rows.markers.map((m) => [String(m.channel_id), m.last_read_at ? String(m.last_read_at) : null]));
  const out: ChatChannel[] = [];
  const sorted = [...rows.areas].sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
  for (const a of sorted) {
    const c = rows.channels.find((x) => x.kind === 'area' && x.area === a.slug);
    if (!c) continue;
    const id = String(c.id);
    out.push({ key: id, id, kind: 'area', area: String(a.slug), name: String(a.name), otherUserId: null, initials: null, lastReadAt: readBy.get(id) ?? null, unreadExtra: unreadBy.get(id) ?? 0, people: people.length });
  }
  for (const p of people) {
    if (p.userId === me) continue;
    const c = rows.channels.find((x) => x.kind === 'direct' && x.direct_key === directKey(me, p.userId));
    const id = c ? String(c.id) : null;
    out.push({ key: `direct:${p.userId}`, id, kind: 'direct', area: null, name: p.displayName, otherUserId: p.userId, initials: p.initials, lastReadAt: id ? (readBy.get(id) ?? null) : null, unreadExtra: id ? (unreadBy.get(id) ?? 0) : 0, people: 2 });
  }
  return out;
}

/** The messages oldest first (they are read newest first, so the page gets the latest ones). */
export function mapMessages(rows: Row[]): ChatMessage[] {
  return rows
    .map((m) => ({
      id: String(m.id),
      channelId: String(m.channel_id),
      authorId: m.author_id ? String(m.author_id) : null,
      isBot: Boolean(m.is_bot),
      body: String(m.body ?? ''),
      taskId: m.task_id ? String(m.task_id) : null,
      createdAt: String(m.created_at),
    }))
    // Oldest first; two messages saved in the same instant keep the database's id order (the reads break ties by id).
    .sort((a, b) => compareAt(a.createdAt, b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The per-channel reads merged: `reads[i]` is channel `ids[i]`'s newest messages, newest first, read one past the cap.
 * Each channel draws at most `cap`; a channel is capped (older messages exist that are not loaded) only when more than
 * `cap` came back. Returns every drawn message oldest first, and the capped channels.
 */
export function mergeChannelReads(ids: string[], reads: Row[][], cap: number): { messages: ChatMessage[]; capped: string[] } {
  return {
    messages: mapMessages(reads.flatMap((r) => r.slice(0, cap))),
    capped: ids.filter((_, i) => (reads[i]?.length ?? 0) > cap),
  };
}

/**
 * The server's unread counts include messages too old to be loaded: each channel keeps only the part the loaded messages
 * do not explain (`unreadExtra`), so the page's own count (loaded unread + extra) equals the server's.
 */
export function settleUnread(channels: ChatChannel[], messages: ChatMessage[], me: string): ChatChannel[] {
  return channels.map((c) => {
    if (!c.id) return c;
    const loaded = messages.filter((m) => m.channelId === c.id && isUnread(m, c.lastReadAt, me)).length;
    return { ...c, unreadExtra: Math.max(0, c.unreadExtra - loaded) };
  });
}

/** The pinned list (read-only), in the order read. */
export function mapPins(rows: Row[]): ChatPin[] {
  return rows.map((p) => ({ id: String(p.id), channelId: p.channel_id ? String(p.channel_id) : null, label: String(p.label ?? '') }));
}
