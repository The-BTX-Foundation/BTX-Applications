// POST /api/push/unregister { token }: the signed-in board member turned notifications off on this phone.
import { NextResponse } from 'next/server';
import { createServiceClient } from '@btx/data/server';
import { isJsonRequest, staffCaller } from '@/lib/push/server';

export const dynamic = 'force-dynamic';
const TOKEN = /^[0-9a-fA-F]{32,512}$/;

export async function POST(request: Request) {
  if (!isJsonRequest(request)) return NextResponse.json({ error: 'json only' }, { status: 415 });
  const caller = await staffCaller();
  if (!caller) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (!TOKEN.test(token)) return NextResponse.json({ error: 'bad token' }, { status: 400 });
  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: 'not available' }, { status: 503 });
  const off = await db.from('ops_push_devices').update({ disabled_at: new Date().toISOString() }).eq('user_id', caller.id).eq('token', token).is('disabled_at', null);
  if (off.error) return NextResponse.json({ error: 'not saved' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
