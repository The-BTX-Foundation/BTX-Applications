// POST /api/push/chat { messageId }: called by the Board chat right after a message is posted. Messages are written from the
// browser, so this is how the server learns of one. It checks the message is the caller's own, recent and not a bot's,
// then sends "Board chat · <name> sent a message." (never the message itself) to the channel's other members. Each message
// pushes once per person, so calling it again does nothing.
import { NextResponse } from 'next/server';
import { createServiceClient } from '@btx/data/server';
import { planChatPushes } from '@btx/push';
import { isJsonRequest, sendPushes, staffCaller, staffUserIds } from '@/lib/push/server';
import { sessionClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FRESH_MS = 5 * 60_000;

export async function POST(request: Request) {
  if (!isJsonRequest(request)) return NextResponse.json({ error: 'json only' }, { status: 415 });
  const caller = await staffCaller();
  if (!caller) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { messageId?: unknown } | null;
  const messageId = typeof body?.messageId === 'string' ? body.messageId : '';
  if (!UUID.test(messageId)) return NextResponse.json({ error: 'bad message' }, { status: 400 });
  // Read as the caller: the database's rules decide whether they can see this message at all.
  // (chat_messages is not in the generated types yet, so the client is used through the shape this one query needs.)
  const session = (await sessionClient()) as unknown as { from: (t: string) => { select: (c: string) => { eq: (c: string, v: string) => { maybeSingle: () => PromiseLike<{ data: unknown }> } } } };
  const msg = await session.from('chat_messages').select('id, channel_id, author_id, is_bot, created_at').eq('id', messageId).maybeSingle();
  const m = msg.data as { id: string; channel_id: string; author_id: string | null; is_bot: boolean; created_at: string } | null;
  if (!m || m.is_bot || m.author_id !== caller.id || Date.now() - Date.parse(m.created_at) > FRESH_MS) return NextResponse.json({ ok: true, sent: 0 });
  const db = createServiceClient();
  if (!db) return NextResponse.json({ ok: true, sent: 0 });
  try {
    const [channel, author] = await Promise.all([
      db.from('chat_channels').select('kind').eq('id', m.channel_id).maybeSingle(),
      db.from('staff_profiles').select('display_name').eq('user_id', caller.id).maybeSingle(),
    ]);
    const kind = (channel.data as { kind?: string } | null)?.kind;
    if (channel.error || (kind !== 'direct' && kind !== 'area')) return NextResponse.json({ ok: true, sent: 0 }); // unknown channel: say nothing rather than tell everyone
    const staff = await staffUserIds(db);
    const recipients =
      kind === 'direct'
        ? (((await db.from('chat_channel_members').select('user_id').eq('channel_id', m.channel_id)).data ?? []) as { user_id: string }[]).map((r) => r.user_id).filter((id) => staff.includes(id))
        : staff;
    const items = planChatPushes({ messageId: m.id, authorName: (author.data as { display_name?: string } | null)?.display_name ?? '', recipientIds: recipients.filter((id) => id !== caller.id) });
    const summary = await sendPushes(items, db);
    return NextResponse.json({ ok: true, sent: summary.delivered });
  } catch {
    return NextResponse.json({ ok: true, sent: 0 });
  }
}
