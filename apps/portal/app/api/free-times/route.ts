// Saves the signed-in student's "None of these times work" answer, then tells the board (see lib/free-times-notify.ts).
// The browser calls this instead of writing interview_free_times directly. Body: { applicationId, ranges, said }.
// Answers { ok: true } or { ok: false, kind: 'booking_closed' | 'refused' | 'failed' }.
// Env: RESEND_API_KEY and PORTAL_EMAIL_FROM (without them no email is sent), SUPABASE_SERVICE_ROLE_KEY (without it the
// answer is saved and nobody is alerted), OPS_HUB_URL (optional; defaults to https://ops.thebtxfoundation.org).
import { after, NextResponse } from 'next/server';
import { sendFreeRanges, type FreeRange } from '@btx/data';
import { createServiceClient } from '@btx/data/server';
import { supabaseMailLog } from '@btx/emails';
import { deliverPush } from '@btx/push';
import { readAlertApplication, readBookingClosed, readRecentAlert, readStaffIds, saveAndNotify, type ServiceDb } from '@/lib/free-times-notify';
import { sessionClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
// The email and pushes run after the answer (after()); this keeps the function alive for them.
export const maxDuration = 60;

const OPS_FALLBACK = 'https://ops.thebtxfoundation.org';

/** Saves her free times as the signed-in student, then alerts the board after the answer has gone back. */
export async function POST(request: Request) {
  const client = await sessionClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return NextResponse.json({ ok: false, kind: 'refused' }, { status: 401 });
  let body: { applicationId?: unknown; ranges?: unknown; said?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, kind: 'failed' }, { status: 400 });
  }
  if (typeof body.applicationId !== 'string' || !body.applicationId || !Array.isArray(body.ranges)) {
    return NextResponse.json({ ok: false, kind: 'failed' }, { status: 400 });
  }
  const applicationId = body.applicationId;
  // sendFreeRanges drops anything that is not a { day, start, end } of strings.
  const row = { ranges: body.ranges as FreeRange[], said: typeof body.said === 'string' ? body.said.slice(0, 2000) : '' };

  const admin = createServiceClient();
  // The service client is used only AFTER her own session saved (or was refused): it reads her application, the deadline,
  // the email log and the staff list. It never writes her answer.
  const db = admin as unknown as ServiceDb | null;
  const result = await saveAndNotify(applicationId, row, {
    save: (r) => sendFreeRanges(client, applicationId, r),
    closed: async () => (db ? readBookingClosed(db, applicationId, new Date()) : null),
    notify: db
      ? {
          application: () => readAlertApplication(db, applicationId),
          recentAlert: (since) => readRecentAlert(db, applicationId, since),
          staffIds: () => readStaffIds(db),
          push: (items) => deliverPush(admin!, items),
          log: supabaseMailLog(admin!),
          from: process.env.PORTAL_EMAIL_FROM,
          opsUrl: process.env.OPS_HUB_URL || OPS_FALLBACK,
        }
      : null,
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
