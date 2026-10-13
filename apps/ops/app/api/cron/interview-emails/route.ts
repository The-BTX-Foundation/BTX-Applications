// Daily cron for the interview emails. GET /api/cron/interview-emails?kind=prep|reminder
//   prep      the evening before: each interviewer's prep email for tomorrow's interviews
//   reminder  the morning before: each student's reminder
// Vercel calls it with `Authorization: Bearer ${CRON_SECRET}` (set CRON_SECRET in the project's env); anything else gets
// 401. Returns the counts as JSON. Safe to run twice: email_log keeps every email to once.
//
// Schedules are in apps/ops/vercel.json and Vercel cron runs in UTC, with no daylight saving. The Nov 10-20 interviews
// fall in Eastern Standard Time (UTC-5), so 23:00 UTC is 6 PM and 14:00 UTC is 9 AM. In the daylight-saving months
// (March to early November) the same schedules run an hour later in Eastern time (7 PM and 10 AM). "Tomorrow" is
// worked out in Eastern time inside the senders, so the choice of interviews is right either way. Vercel's Hobby plan
// allows daily crons only and may run one any time within its hour.
import { NextResponse } from 'next/server';
import { sendPrepEmails, sendReminderEmails, type InterviewDeps } from '@/lib/email/interviews';

export const dynamic = 'force-dynamic';

async function handleCron(request: Request, deps: InterviewDeps = {}): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const kind = new URL(request.url).searchParams.get('kind');
  if (kind !== 'prep' && kind !== 'reminder') return NextResponse.json({ error: 'kind must be prep or reminder' }, { status: 400 });
  try {
    const result = kind === 'prep' ? await sendPrepEmails(new Date(), deps) : await sendReminderEmails(new Date(), deps);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (err) {
    console.error('[cron] interview emails failed', err);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleCron(request);
}
