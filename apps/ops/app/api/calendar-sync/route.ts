// GET /api/calendar-sync: the full list of events the board's shared Google Calendar should hold (every item on the
// Calendar page, see lib/calendar-sync/build-events.ts). One caller only: the BTX Apps Script owned by
// info@thebtxfoundation.org (apps/ops/google/calendar-sync/), proven by a Google-signed identity token
// (lib/calendar-sync/verify-caller.ts). The proxy lets this path through without a session because of that check.
//
//   401 {"error":"unauthorized"}  anyone else
//   503 {"error":"unavailable"}   a read or build failed (never a 200 with an empty list: the script would delete events)
//   200 { version: 1, generatedAt, windowStart, windowEnd, events }  (Eastern days; windowStart inclusive, windowEnd
//       exclusive; the script lists Google's events over the same range)
// Every answer is Cache-Control: no-store.
import { NextResponse } from 'next/server';
import { verifySyncCaller } from '@/lib/calendar-sync/verify-caller';
import { loadSyncRows } from '@/lib/calendar-sync/load-rows';
import { buildSyncEvents, syncWindow } from '@/lib/calendar-sync/build-events';
import { opsHubUrl } from '@/lib/calendar-sync/config';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

// Checks the caller, then reads and builds the feed.
export async function GET(request: Request): Promise<Response> {
  const caller = await verifySyncCaller(request.headers.get('authorization'));
  if (!caller.ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  try {
    const now = new Date();
    const rows = await loadSyncRows();
    const events = buildSyncEvents(rows, now, opsHubUrl());
    const win = syncWindow(now);
    return NextResponse.json(
      { version: 1, generatedAt: now.toISOString(), windowStart: win.start, windowEnd: win.end, events },
      { status: 200, headers: NO_STORE },
    );
  } catch {
    // Fixed message only: the error could carry row data, and none of it belongs in the logs.
    console.error('[calendar-sync] feed failed');
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE });
  }
}
