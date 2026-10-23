// POST /api/push/status { token }: does the signed-in board member have this phone switched on? The app asks when the menu
// opens, so the Notifications switch shows what the server will do (another person may have signed in on this phone since,
// or a push error may have switched the phone off) rather than what the phone remembers.
//   on     this person has an active row for this token
//   known  this person has ever registered this token (a switched-off row counts)
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
  const row = await db.from('ops_push_devices').select('disabled_at').eq('user_id', caller.id).eq('token', token).maybeSingle();
  if (row.error) return NextResponse.json({ error: 'not read' }, { status: 500 });
  const found = row.data as { disabled_at: string | null } | null;
  return NextResponse.json({ known: Boolean(found), on: Boolean(found && !found.disabled_at) });
}
