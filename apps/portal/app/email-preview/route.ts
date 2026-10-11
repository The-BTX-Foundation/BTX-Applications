// A browser preview of the confirmation email with the drafts' sample data. Mock mode only (never in a real
// deployment), for design review.
import { NextResponse } from 'next/server';
import { getAuthMode } from '@btx/data';
import { confirmationHtml } from '@/lib/email/confirmation';

export async function GET() {
  if (getAuthMode() !== 'mock') return new NextResponse('Not found', { status: 404 });
  const html = confirmationHtml({
    firstName: 'Ebony',
    to: 'ecoleman@terpmail.umd.edu',
    code: 'APP-2026-00016',
    submittedLabel: 'Sat Sep 12, 4:52 PM',
    term: 'Fall 2026',
    award: 'Legacy Scholarship',
    interviewWeeks: 'Sep 15 to Oct 9',
    decisionDate: 'Fri Oct 23',
    statusUrl: 'http://localhost:3000/status',
    helpEmail: 'info@thebtxfoundation.org',
  });
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
