// Books or switches an interview time for the signed-in student, then sends the booking emails (see lib/book-emails.ts).
// The browser calls this instead of calling switch_booking directly. Body: { slotId, note? }. Answers with the same
// shape as bookSlot(): { ok: true, result } or { ok: false, kind }.
// Env: RESEND_API_KEY and PORTAL_EMAIL_FROM (without them nothing is sent), SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SITE_URL.
import { after, NextResponse } from 'next/server';
import { bookSlot } from '@btx/data';
import { createServiceClient } from '@btx/data/server';
import { readCycleInfo, readInterviews, supabaseMailLog } from '@btx/emails';
import { deliverPush } from '@btx/push';
import { bookAndNotify } from '@/lib/book-emails';
import { sessionClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const client = await sessionClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return NextResponse.json({ ok: false, kind: 'not_submitted' }, { status: 401 });
  let body: { slotId?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, kind: 'unknown' }, { status: 400 });
  }
  if (typeof body.slotId !== 'string' || !body.slotId) return NextResponse.json({ ok: false, kind: 'unknown' }, { status: 400 });
  const note = typeof body.note === 'string' ? body.note : undefined;

  const admin = createServiceClient();
  const userId = auth.user.id;
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/+$/, '');
  if (!admin) {
    // No service key on this server: book without emails.
    return NextResponse.json(await bookSlot(client, body.slotId, note));
  }
  const result = await bookAndNotify(body.slotId, note, {
    book: (slotId, n) => bookSlot(client, slotId, n),
    heldSlot: async () => {
      const apps = await admin.from('applications').select('id').eq('user_id', userId);
      const ids = (apps.data ?? []).map((a) => a.id);
      if (ids.length === 0) return null;
      const held = await admin.from('bookings').select('slot_id').eq('status', 'active').in('application_id', ids).maybeSingle();
      return held.data?.slot_id ?? null;
    },
    interviews: (slotIds) => readInterviews(admin, { slotIds }),
    cycleInfo: (id) => readCycleInfo(admin, id),
    log: supabaseMailLog(admin),
    push: (items) => deliverPush(admin, items),
    from: process.env.PORTAL_EMAIL_FROM,
    portalUrl: origin,
    later: (work) => {
      try {
        after(work);
      } catch {
        return work(); // not inside a request (tests): run it now
      }
    },
  });
  return NextResponse.json(result);
}
