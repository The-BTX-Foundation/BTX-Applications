// Daily cron for the interview emails. GET /api/cron/interview-emails?kind=prep|reminder
//   prep      the evening before: each interviewer's prep email for tomorrow's interviews
//   reminder  the morning before: each student's reminder
// The same run also sends the matching pushes (prep: "Interviews tomorrow"; reminder: "Due tomorrow").
// The prep run also keeps the Teams sign-in alive: when the saved refresh token is older than about 25 days it is used
// once (lib/teams/token.ts keepTokenFresh), so it never lapses between semesters. That never changes the response.
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
import { sendDueTomorrowPushes, sendPrepPushes } from '@/lib/push/crons';
import { serverKeepTokenFresh, type KeepFresh } from '@/lib/teams/token';

export const dynamic = 'force-dynamic';
// The pushes run inside this request (one at a time, each with its own 10 second cap, 40 seconds in all); this keeps the function alive that long.
export const maxDuration = 60;

// `keepFresh` is the Teams token refresh (a fake in tests).
async function handleCron(request: Request, deps: InterviewDeps = {}, keepFresh: (now: Date) => Promise<KeepFresh> = serverKeepTokenFresh): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const kind = new URL(request.url).searchParams.get('kind');
  if (kind !== 'prep' && kind !== 'reminder') return NextResponse.json({ error: 'kind must be prep or reminder' }, { status: 400 });
  // The pushes run beside the emails and never hold them up or fail them: prep sends "Interviews tomorrow" to each
  // interviewer, reminder sends "Due tomorrow" to the assignees of tasks due tomorrow (lib/push/crons.ts).
  const now = new Date();
  const pushRun = (kind === 'prep' ? sendPrepPushes(now) : sendDueTomorrowPushes(now)).catch((err) => {
    console.error('[cron] pushes failed', err instanceof Error ? err.message : 'unknown');
    return null;
  });
  // Once a day (the prep run). serverKeepTokenFresh never throws and logs any problem with no detail.
  const teamsRun = kind === 'prep' ? keepFresh(now).catch(() => 'failed' as const) : Promise.resolve(null);
  try {
    const result = kind === 'prep' ? await sendPrepEmails(now, deps) : await sendReminderEmails(now, deps);
    const [push] = await Promise.all([pushRun, teamsRun]);
    return NextResponse.json({ ...result, push }, { status: result.ok ? 200 : 500 });
  } catch (err) {
    console.error('[cron] interview emails failed', err);
    await Promise.all([pushRun, teamsRun]);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleCron(request);
}
