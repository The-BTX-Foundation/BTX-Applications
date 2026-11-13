// Live mode: builds the Board chat view (lib/chat-view.ts) from the real tables as the signed-in person. Every read goes
// through the session client, so row-level security decides which channels, messages and pins the person sees (area
// channels for the board; a direct channel only for its two members). The mapping is pure (lib/chat-map.ts).
import { callRpc, readRows, whoAmI, type Row } from './daily-db';
import { sessionClient } from './supabase-server';
import { chatPeople, dateLabel, mapChannels, mapPins, mergeChannelReads, settleUnread } from './chat-map';
import { easternDay } from './refresh-time';
import type { ChatCaps, ChatResult } from './chat-view';

/** How many of the newest messages the page draws in each listed channel (area and direct); it reads one more to tell. */
export const PER_CHANNEL_LIMIT = 50;

/** Live capabilities: only where a real write exists. */
export const LIVE_CAPS: ChatCaps = {
  send: true, // chat_messages insert (RLS: the author is the caller and a member of the channel), then POST /api/push/chat
  openDirect: true, // rpc open_direct_channel(p_other) creates or finds the two-person channel
  markRead: true, // chat_read_markers upsert of the caller's own rows
  unsend: false, // off by the spec: the table allows deleting your own message, but the app has no tested delete path yet
  pinToggle: false, // off by the spec: chat_pins allows team writes, but the page draws no pin control; the list is read-only
};

// The session client through a loose shape: lib/daily-db.ts's reader orders by one column only, and the message reads
// need two (created_at, then id, so messages saved in the same instant come back in a fixed order).
type Q = PromiseLike<{ data: Row[] | null; error: unknown }> & {
  eq: (c: string, v: unknown) => Q;
  order: (c: string, o: { ascending: boolean }) => Q;
  limit: (n: number) => Q;
};
type Loose = { from: (t: string) => { select: (cols: string) => Q } };

// One channel's newest messages, newest first: one past PER_CHANNEL_LIMIT, so a full channel can be told from one that
// has exactly that many. Throws when the database says no.
async function readChannel(client: Loose, channelId: string): Promise<Row[]> {
  const { data, error } = await client
    .from('chat_messages')
    .select('id, channel_id, author_id, is_bot, body, task_id, created_at')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PER_CHANNEL_LIMIT + 1);
  if (error) throw error;
  return data ?? [];
}

/**
 * Reads the chat. `{ failed: true }` when the person cannot be identified, when the staff directory cannot be read (a
 * signed-in person who is not staff is refused there), or when the person is not in the chat (admins and board members
 * only). Any other failed read (channels, unread counts, markers, pins, areas, or any one channel's messages) returns the
 * view with `threadFailed`: the window says it didn't load, never an empty "No messages here yet."
 */
export async function loadLiveChatView(): Promise<ChatResult> {
  const who = await whoAmI().catch(() => null);
  if (!who) return { failed: true };
  // The server's clock: the page stamps read markers from it (or from loaded messages), never from the browser's.
  const nowIso = new Date().toISOString();
  const today = easternDay(nowIso);
  const base = { failed: false as const, today, dateLabel: dateLabel(today), now: nowIso, caps: LIVE_CAPS };
  // The directory decides who is in the chat; when it cannot be read the person is not let in.
  const directory = await callRpc('staff_directory').catch(() => null);
  if (!directory) return { failed: true };
  try {
    const [profiles, channels, unread, markers, pins, areas] = await Promise.all([
      readRows('staff_profiles', 'user_id, display_name, initials', { order: ['display_name', true] }),
      readRows('chat_channels', 'id, kind, area, direct_key'),
      readRows('chat_unread_counts', 'channel_id, unread'),
      readRows('chat_read_markers', 'channel_id, last_read_at', { eq: { user_id: who.id } }),
      readRows('chat_pins', 'id, channel_id, label', { order: ['position', true] }),
      readRows('areas', 'slug, name, position', { order: ['position', true] }),
    ]);
    const people = chatPeople({ profiles, directory });
    const me = people.find((p) => p.userId === who.id);
    // Only admins and board members are in the chat.
    if (!me) return { failed: true };
    const list = mapChannels({ channels, unread, markers, areas }, people, who.id);
    const ids = list.map((c) => c.id).filter((x): x is string => Boolean(x));
    // One read per listed channel, in parallel, so a busy channel never pushes a quiet one's messages out. One failed
    // read fails the window (caught below).
    const client = (await sessionClient()) as unknown as Loose;
    const reads = await Promise.all(ids.map((id) => readChannel(client, id)));
    const { messages, capped } = mergeChannelReads(ids, reads, PER_CHANNEL_LIMIT);
    // Only pins of the listed channels (or All areas) are drawn.
    const shown = new Set(ids);
    return {
      ...base,
      threadFailed: false,
      me,
      people,
      channels: settleUnread(list, messages, who.id),
      messages,
      capped,
      pins: mapPins(pins).filter((p) => p.channelId === null || shown.has(p.channelId)),
    };
  } catch {
    return { ...base, threadFailed: true, me: { userId: who.id, displayName: '', initials: '' }, people: [], channels: [], messages: [], capped: [], pins: [] };
  }
}
