// The Board chat page's data. Types mirror the draft Ops Hub schema (chat_channels, chat_messages, chat_read_markers,
// chat_pins, staff_profiles; see supabase/migrations/20261010120000_ops_hub.sql in the ops-schema worktree).
// Mock mode (no Supabase env) returns the Figma sample (mock/chat.ts). Live mode reads the draft tables.
import { hasSupabaseEnv } from '@btx/data';
import { sessionClient } from './supabase-server';
import { CHAT_MOCK, CHAT_STRESS } from '@/mock/chat';

export type ChatPerson = { userId: string; displayName: string; initials: string };

export type ChatChannel = {
  /** chat_channels.id; null for a direct conversation that does not exist yet (open_direct_channel creates it). */
  id: string | null;
  kind: 'area' | 'direct';
  /** areas.slug for an area channel. */
  area: string | null;
  /** The label in the list: the area name, or the other person's name. */
  name: string;
  /** direct only: the other person. */
  otherUserId: string | null;
  initials: string | null;
  /** chat_unread_counts.unread; null = show no pill. */
  unread: number | null;
  /** chat_read_markers.last_read_at for the signed-in person (ISO), or null = never read. */
  lastReadAt: string | null;
  /** Members shown under the thread's title ("7 people"). */
  people: number;
};

export type ChatMessageRow = {
  id: string;
  channelId: string;
  authorId: string | null;
  isBot: boolean;
  body: string;
  taskId: string | null;
  createdAt: string;
};

export type ChatPinRow = { id: string; channelId: string | null; label: string };

export type ChatData = {
  failed: boolean;
  me: ChatPerson;
  people: ChatPerson[];
  channels: ChatChannel[];
  messages: ChatMessageRow[];
  pins: ChatPinRow[];
  /** The id of the "All areas" view's Today anchor: the page's ISO "now" (mock: Sunday, October 4, 2026). */
  now: string;
};

const EMPTY: ChatData = { failed: true, me: { userId: '', displayName: '', initials: '' }, people: [], channels: [], messages: [], pins: [], now: '' };

// Loads the chat for the signed-in person. demo: 'error' draws the load-error card, 'stress' the long-text fixture.
export async function loadChat({ demo }: { demo?: string } = {}): Promise<ChatData> {
  if (demo === 'error') return EMPTY;
  if (!hasSupabaseEnv()) return demo === 'stress' ? CHAT_STRESS : CHAT_MOCK;
  try {
    // NOT TESTED: needs the Ops Hub tables (draft schema, not applied).
    const client = await sessionClient();
    const { data: auth } = await client.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return EMPTY;
    // The draft tables are not in the generated types yet, so the client is used through a loose shape.
    const db = client as unknown as LooseClient;
    const [profiles, channels, unread, markers, pins, areas] = await Promise.all([
      db.from('staff_profiles').select('user_id, display_name, initials'),
      db.from('chat_channels').select('id, kind, area, direct_key'),
      db.from('chat_unread_counts').select('channel_id, unread'),
      db.from('chat_read_markers').select('channel_id, last_read_at').eq('user_id', uid),
      db.from('chat_pins').select('id, channel_id, label').order('position'),
      db.from('areas').select('slug, name, position').order('position'),
    ]);
    for (const r of [profiles, channels, unread, markers, pins, areas]) if (r.error) throw r.error;
    const people: ChatPerson[] = (profiles.data ?? []).map((p) => ({ userId: String(p.user_id), displayName: String(p.display_name), initials: String(p.initials) }));
    const me = people.find((p) => p.userId === uid);
    if (!me) return EMPTY;
    const unreadBy = new Map((unread.data ?? []).map((u) => [String(u.channel_id), Number(u.unread)]));
    const readBy = new Map((markers.data ?? []).map((m) => [String(m.channel_id), String(m.last_read_at)]));
    const areaRows = areas.data ?? [];
    const out: ChatChannel[] = [];
    for (const a of areaRows) {
      const c = (channels.data ?? []).find((x) => x.kind === 'area' && x.area === a.slug);
      if (!c) continue;
      const id = String(c.id);
      out.push({ id, kind: 'area', area: String(a.slug), name: String(a.name), otherUserId: null, initials: null, unread: unreadBy.get(id) || null, lastReadAt: readBy.get(id) ?? null, people: people.length });
    }
    // Every other board member is a direct entry; the channel exists once open_direct_channel has been called.
    for (const p of people) {
      if (p.userId === uid) continue;
      const key = [uid, p.userId].sort().join(':');
      const c = (channels.data ?? []).find((x) => x.kind === 'direct' && x.direct_key === key);
      const id = c ? String(c.id) : null;
      out.push({ id, kind: 'direct', area: null, name: p.displayName, otherUserId: p.userId, initials: p.initials, unread: (id && unreadBy.get(id)) || null, lastReadAt: (id && readBy.get(id)) || null, people: 2 });
    }
    const ids = out.map((c) => c.id).filter((x): x is string => Boolean(x));
    // The latest 200 messages across the visible channels, oldest first.
    const msgs = await db.from('chat_messages').select('id, channel_id, author_id, is_bot, body, task_id, created_at').in('channel_id', ids).order('created_at', { ascending: false }).limit(200);
    if (msgs.error) throw msgs.error;
    const messages: ChatMessageRow[] = (msgs.data ?? [])
      .map((m) => ({ id: String(m.id), channelId: String(m.channel_id), authorId: m.author_id ? String(m.author_id) : null, isBot: Boolean(m.is_bot), body: String(m.body), taskId: m.task_id ? String(m.task_id) : null, createdAt: String(m.created_at) }))
      .reverse();
    return {
      failed: false,
      me,
      people,
      channels: out,
      messages,
      pins: (pins.data ?? []).map((p) => ({ id: String(p.id), channelId: p.channel_id ? String(p.channel_id) : null, label: String(p.label) })),
      now: new Date().toISOString(),
    };
  } catch {
    return EMPTY;
  }
}

// The slice of the Supabase query builder these loaders use (the draft tables have no generated types yet).
type Row = Record<string, unknown>;
type LooseResult = PromiseLike<{ data: Row[] | null; error: unknown }>;
type LooseQuery = LooseResult & {
  eq: (col: string, v: string) => LooseQuery;
  in: (col: string, v: string[]) => LooseQuery;
  order: (col: string, o?: { ascending: boolean }) => LooseQuery;
  limit: (n: number) => LooseQuery;
};
export type LooseClient = { from: (t: string) => { select: (cols: string) => LooseQuery } };
