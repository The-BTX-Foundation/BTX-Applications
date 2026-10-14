// Pure helpers for Board chat and the area chat panels (no server imports, so client components and tests may use them).
import type { ChatChannel, ChatMessageRow } from './chat';

const NY = 'America/New_York';
const eastern = (ts: string | number) => new Intl.DateTimeFormat('en-CA', { timeZone: NY }).format(new Date(ts));

/** "Today", "Yesterday", or "Wed Sep 30" for an older day (Eastern time). */
export function dayName(ts: string, nowMs: number): string {
  const d = eastern(ts);
  if (d === eastern(nowMs)) return 'Today';
  if (d === eastern(nowMs - 86_400_000)) return 'Yesterday';
  return new Intl.DateTimeFormat('en-US', { timeZone: NY, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(ts)).replace(',', '');
}

/** Which unread messages the channels in `ids` hold for the person `me`: the first one's id and how many (null = none). */
export function unreadSplit(channels: ChatChannel[], messages: ChatMessageRow[], ids: string[], me: string): { firstId: string; count: number } | null {
  const last = new Map(channels.map((c) => [c.id, c.lastReadAt]));
  const unread = messages.filter((m) => ids.includes(m.channelId) && m.authorId !== me && Date.parse(m.createdAt) > Date.parse(last.get(m.channelId) ?? '1970-01-01T00:00:00Z'));
  return unread.length ? { firstId: unread[0].id, count: unread.length } : null;
}

/** True when a direct channel's key ('<id>:<id>', in the database's text order) is the pair of these two people. */
export function isDirectKeyOf(key: string | null | undefined, a: string, b: string): boolean {
  if (!key) return false;
  const parts = key.split(':');
  return parts.length === 2 && parts.includes(a) && parts.includes(b) && a !== b;
}

/** A message as an area chat panel draws it. */
export type AreaMsg = { id: string; day: string; who: string; initials?: string; bot?: boolean; mine?: boolean; time: string; text: string };

/** Maps message rows (oldest first) to the panel's shape: day label, author name and initials, "mine", bot. */
export function toAreaMessages(
  rows: Pick<ChatMessageRow, 'id' | 'authorId' | 'isBot' | 'body' | 'createdAt'>[],
  people: Map<string, { displayName: string; initials: string }>,
  me: string,
  nowMs: number,
  time: (iso: string) => string,
): AreaMsg[] {
  return rows.map((m) => {
    const p = m.authorId ? people.get(m.authorId) : undefined;
    return {
      id: m.id,
      day: dayName(m.createdAt, nowMs),
      who: m.isBot ? 'BTX' : (p?.displayName ?? 'Former member'),
      initials: m.isBot ? undefined : (p?.initials ?? '?'),
      bot: m.isBot || undefined,
      mine: (!m.isBot && m.authorId === me) || undefined,
      time: time(m.createdAt),
      text: m.body,
    };
  });
}
