// A browser preview of the emails with the drafts' sample data. Mock mode only (never in a real deployment), for
// design review. `?email=` picks one: confirmation (default), book, won, not-picked. Nothing here sends anything.
import { NextResponse } from 'next/server';
import { getAuthMode } from '@btx/data';
import { confirmationHtml } from '@/lib/email/confirmation';
import { bookHtml, notPickedHtml, wonHtml } from '@/lib/email/journey';

export async function GET(request: Request) {
  if (getAuthMode() !== 'mock') return new NextResponse('Not found', { status: 404 });
  const which = new URL(request.url).searchParams.get('email') ?? 'confirmation';
  const origin = new URL(request.url).origin;
  const base = {
    firstName: 'Ebony',
    to: 'ecoleman@terpmail.umd.edu',
    code: 'APP-2026-00016',
    term: 'Fall 2026',
    award: 'Legacy Scholarship',
    helpEmail: 'info@thebtxfoundation.org',
  };
  let html: string;
  if (which === 'book') html = bookHtml({ ...base, origin, bookBy: '[date]' });
  else if (which === 'won') html = wonHtml({ ...base, origin, amount: '[amount]', photoDue: '[date]' });
  else if (which === 'not-picked') html = notPickedHtml({ ...base, origin });
  else {
    html = confirmationHtml({
      ...base,
      submittedLabel: 'Sat Sep 12, 4:52 PM',
      interviewWeeks: 'Sep 15 to Oct 9',
      decisionDate: 'Fri Oct 23',
      statusUrl: `${origin}/status`,
    });
  }
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
