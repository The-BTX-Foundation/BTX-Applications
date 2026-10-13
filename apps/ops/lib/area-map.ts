// Pure helpers the Programs and Outreach loaders share (no database, no next/headers, so they are unit tested):
// money text, owners, chat messages and the little date words the pages show.
import type { AreaChat, ChatMsg, Owner, Person } from '@/mock/area';
import { dateOnlyLabel, timeLabel } from './format';

export type Row = Record<string, unknown>;

export const s = (v: unknown): string => (v == null ? '' : String(v));
export const n = (v: unknown): number => (v == null || v === '' ? 0 : Number(v));

/** 150000 cents -> "$1,500" (cents are shown only when there are some). */
export function usd(cents: unknown): string {
  const c = n(cents);
  const dollars = c / 100;
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** "2026-10-12" from a timestamp, in Eastern time. */
export function easternDay(ts: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(ts));
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "2026-10-12" -> "October". */
export const monthName = (iso: string): string => MONTHS[Number(iso.slice(5, 7)) - 1] ?? '';
/** The month after the one named ("October" -> "November"). */
export const nextMonthName = (name: string): string => MONTHS[(MONTHS.indexOf(name) + 1) % 12] ?? '';

/** The people the pickers offer, and a lookup by user id. */
export type StaffMap = Map<string, Person>;
export function staffMap(rows: Row[]): StaffMap {
  return new Map(rows.map((r) => [s(r.user_id), { id: s(r.user_id), name: s(r.display_name), initials: s(r.initials) }]));
}

const GROUPS: Record<string, Person> = {
  bot: { name: 'BTX', initials: 'BT' },
  board: { name: 'Board', initials: 'BD' },
  all_board: { name: 'All board members', initials: 'AB' },
  interview_pairs: { name: 'Interview pairs', initials: 'IP' },
};

/** A task's owner: the first person in task_assignees, else its group, else nobody. */
export function taskOwner(assigneeIds: string[], group: unknown, staff: StaffMap): Owner {
  for (const id of assigneeIds) {
    const p = staff.get(id);
    if (p) return p;
  }
  return GROUPS[s(group)] ?? null;
}

/** An owner column value for an owner_id (null = nobody). */
export const personOrNull = (id: unknown, staff: StaffMap): Person | null => (id ? (staff.get(s(id)) ?? null) : null);

/** "Dania Morris · Thu Oct 22" for a phone second line. */
export function ownerDueLine(owner: Owner, due: string | null | undefined, fallback = 'Not scheduled'): string {
  const who = owner === 'unassigned' ? 'Unassigned' : owner ? owner.name : '';
  const when = due ? dateOnlyLabel(due) : '';
  return [who, when].filter(Boolean).join(' · ') || fallback;
}

/** "Today", "Yesterday" or "Wed Sep 2" for a message time, judged in Eastern time. */
export function chatDay(ts: string, now: string | Date): 'Today' | 'Yesterday' | string {
  const day = easternDay(ts);
  const today = easternDay(now);
  if (day === today) return 'Today';
  const y = new Date(`${today}T12:00:00Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  if (day === y.toISOString().slice(0, 10)) return 'Yesterday';
  return dateOnlyLabel(day);
}

/** The chat panel's thread from chat_messages rows (oldest first). */
export function mapChat(title: string, rows: Row[], staff: StaffMap, meId: string, now: string | Date): AreaChat {
  const messages: ChatMsg[] = rows.map((r) => {
    const bot = r.is_bot === true;
    const author = r.author_id ? staff.get(s(r.author_id)) : undefined;
    const mine = !bot && s(r.author_id) === meId;
    return {
      id: s(r.id),
      day: chatDay(s(r.created_at), now),
      who: bot ? 'BTX' : mine ? 'You' : (author?.name ?? 'Someone'),
      initials: author?.initials,
      bot,
      mine,
      time: timeLabel(s(r.created_at)),
      text: s(r.body),
    };
  });
  return { title, people: staff.size, messages };
}

/** The message a person just posted, as the panel draws it (mine, today). */
export function postedMessage(id: string, body: string, createdAt: string, now: string | Date): ChatMsg {
  return { id, day: chatDay(createdAt, now), who: 'You', bot: false, mine: true, time: timeLabel(createdAt), text: body };
}

/** True for the Today task that opens the "Add the video links" panel (its action reads "Add links"). */
export function isVideoLinksTask(title: string): boolean {
  return /video links?/i.test(title);
}
