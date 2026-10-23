// POST /api/push/test: an admin sends a test push to their own phones (People and roles, in the app).
import { NextResponse } from 'next/server';
import { planTestPush } from '@btx/push';
import { isJsonRequest, sendPushes, staffCaller } from '@/lib/push/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isJsonRequest(request)) return NextResponse.json({ error: 'json only' }, { status: 415 });
  const caller = await staffCaller();
  if (!caller) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  if (caller.role !== 'admin') return NextResponse.json({ error: 'admins only' }, { status: 403 });
  const summary = await sendPushes(planTestPush(caller.id, crypto.randomUUID()));
  return NextResponse.json({ ok: true, configured: summary.configured, delivered: summary.delivered, noDevice: summary.noDevice });
}
