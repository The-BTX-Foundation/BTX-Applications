// POST /api/push/register { token, label? }: the signed-in board member's phone turned notifications on.
// The person is always the signed-in session, never a user id in the body. If the same phone token was registered to
// someone else (a shared phone), that older row is switched off, so one person's pushes never reach another's screen.
import { NextResponse } from 'next/server';
import { createServiceClient } from '@btx/data/server';
import { isJsonRequest, staffCaller } from '@/lib/push/server';

export const dynamic = 'force-dynamic';
const TOKEN = /^[0-9a-fA-F]{32,512}$/;

export async function POST(request: Request) {
  if (!isJsonRequest(request)) return NextResponse.json({ error: 'json only' }, { status: 415 });
  const caller = await staffCaller();
  if (!caller) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { token?: unknown; label?: unknown } | null;
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (!TOKEN.test(token)) return NextResponse.json({ error: 'bad token' }, { status: 400 });
  const label = typeof body?.label === 'string' ? body.label.replace(/\s+/g, ' ').trim().slice(0, 80) : null;
  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: 'not available' }, { status: 503 });
  const now = new Date().toISOString();
  const saved = await db
    .from('ops_push_devices')
    .upsert({ user_id: caller.id, kind: 'apns', token, label: label || null, last_seen_at: now, disabled_at: null, last_error: null }, { onConflict: 'user_id,token' });
  if (saved.error) return NextResponse.json({ error: 'not saved' }, { status: 500 });
  await db.from('ops_push_devices').update({ disabled_at: now }).eq('token', token).neq('user_id', caller.id).is('disabled_at', null);
  return NextResponse.json({ ok: true });
}
