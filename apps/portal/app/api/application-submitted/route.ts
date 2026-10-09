// Called by the browser right after a successful submit. On the server it looks up the signed-in student's submitted
// application (through her own session, so row-level security applies), builds the confirmation email and sends it.
// Without RESEND_API_KEY it only logs. Safe to call twice: the email service gets an idempotency key per application.
import { NextResponse } from 'next/server';
import { fetchPublishedCycle } from '@btx/data';
import { HELP_EMAIL } from '@btx/ui';
import { confirmationHtml, confirmationSubject, confirmationText } from '@/lib/email/confirmation';
import { sendMail } from '@/lib/email/send';
import { toView } from '@/lib/cycle';
import { longDay, shortDay } from '@/lib/format';
import { sessionClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const client = await sessionClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return NextResponse.json({ sent: false }, { status: 401 });
  const { cycle } = await fetchPublishedCycle(client);
  if (!cycle) return NextResponse.json({ sent: false }, { status: 404 });
  const { data: app } = await client.from('applications').select('*').eq('cycle_id', cycle.id).maybeSingle();
  if (!app || app.status !== 'submitted' || !app.applicant_code || !app.submitted_at) {
    return NextResponse.json({ sent: false }, { status: 409 });
  }
  const view = toView(cycle);
  const d = view.drawing;
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const submitted = new Date(app.submitted_at);
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' }).format(submitted).replace(',', '');
  const time = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(submitted);
  const input = {
    firstName: (app.full_name ?? '').split(' ')[0] || 'there',
    to: app.terpmail,
    code: app.applicant_code,
    submittedLabel: `${day}, ${time}`,
    term: view.term ?? '',
    award: view.awardName ?? 'scholarship',
    interviewWeeks: d ? `${shortDay(d.interviewStart)} to ${shortDay(d.interviewEnd)}` : '[dates]',
    decisionDate: d ? longDay(d.decision) : '[date]',
    statusUrl: `${origin}/status`,
    helpEmail: HELP_EMAIL,
  };
  const result = await sendMail({
    to: input.to,
    subject: confirmationSubject(input),
    html: confirmationHtml(input),
    text: confirmationText(input),
    idempotencyKey: `application-submitted-${app.id}`,
  });
  return NextResponse.json(result, { status: 202 });
}
