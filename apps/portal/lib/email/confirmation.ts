// The "Application submitted" confirmation email. Content follows the drafts' confirmation page (application number,
// submit time, what happens next) and the interview email's look (phase-a/portal/email.html): a white card on the
// grey page, a short heading, one gold button, a quiet footer. Inline styles only, because mail apps strip the rest.
// Pure functions: they return strings, so the module is easy to test and to move into an Edge Function later.

export type ConfirmationInput = {
  /** First name, for "Hi Ebony,". */
  firstName: string;
  /** The Terpmail address the copy goes to. */
  to: string;
  /** Like APP-2026-00016. */
  code: string;
  /** "Sat Sep 12, 4:52 PM" (Eastern), already formatted. */
  submittedLabel: string;
  /** "Fall 2026" and "Legacy Scholarship". */
  term: string;
  award: string;
  /** Formatted dates for "what happens next"; any may be a [placeholder]. */
  interviewWeeks: string;
  decisionDate: string;
  /** Absolute link to the status page, like https://apply.example.org/status. */
  statusUrl: string;
  helpEmail: string;
};

// Escapes text for HTML.
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function confirmationSubject(i: Pick<ConfirmationInput, 'code'>): string {
  return `Application submitted: ${i.code}`;
}

// The plain-text version.
export function confirmationText(i: ConfirmationInput): string {
  return [
    `Hi ${i.firstName},`,
    '',
    `Your ${i.term} ${i.award} application is in.`,
    '',
    `Application number: ${i.code}`,
    `Submitted: ${i.submittedLabel} Eastern`,
    '',
    "What's next",
    `- Virtual interviews, ${i.interviewWeeks}. We'll email you to schedule yours.`,
    `- Decision by ${i.decisionDate}, by email. You hear back either way.`,
    '',
    `See your application status: ${i.statusUrl}`,
    '',
    `Questions? Reply to this email or write to ${i.helpEmail}.`,
    '',
    'The BTX Foundation',
    '',
    `You're getting this because you applied for the ${i.term} ${i.award}. Application ${i.code}.`,
  ].join('\n');
}

// The HTML version (table layout, inline styles, 600px card).
export function confirmationHtml(i: ConfirmationInput): string {
  const ink = '#15171a';
  const muted = '#545a60';
  const line = '#c9cec8';
  const font = "'Google Sans Flex','Helvetica Neue',Arial,sans-serif";
  const row = (label: string, value: string) =>
    `<tr><td style="padding:0 24px 0 0;font:600 15px/1.4 ${font};color:${ink};vertical-align:top">${esc(label)}</td><td style="font:15px/1.4 ${font};color:${ink}">${esc(value)}</td></tr>`;
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(confirmationSubject(i))}</title></head>
<body style="margin:0;padding:0;background:#f4f5f2">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f2"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${line}">
<tr><td style="padding:20px 32px;border-bottom:1px solid ${line};font:600 16px/1.4 ${font};color:${ink}">The BTX Foundation <span style="font-weight:400;color:${muted}">&nbsp;|&nbsp; Scholarship application</span></td></tr>
<tr><td style="padding:32px 32px 8px">
<h1 style="margin:0;font:500 32px/1.1 ${font};letter-spacing:-0.01em;color:${ink}">Application submitted.</h1>
<p style="margin:16px 0 0;font:17px/1.5 ${font};color:${ink}">Hi ${esc(i.firstName)}, your ${esc(i.term)} ${esc(i.award)} application is in.</p>
</td></tr>
<tr><td style="padding:16px 32px 0"><table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
${row('Application number', i.code)}
<tr><td colspan="2" style="height:6px"></td></tr>
${row('Submitted', `${i.submittedLabel} Eastern`)}
</table></td></tr>
<tr><td style="padding:28px 32px 0">
<p style="margin:0;font:600 16px/1.4 ${font};color:${ink}">What&rsquo;s next</p>
<p style="margin:8px 0 0;font:16px/1.5 ${font};color:${ink}">Virtual interviews, ${esc(i.interviewWeeks)}. We&rsquo;ll email you to schedule yours.</p>
<p style="margin:8px 0 0;font:16px/1.5 ${font};color:${ink}">Decision by ${esc(i.decisionDate)}, by email. You hear back either way.</p>
</td></tr>
<tr><td style="padding:28px 32px 0">
<a href="${esc(i.statusUrl)}" style="display:inline-block;background:#c99b31;color:${ink};font:600 16px/1 ${font};padding:17px 26px;border-radius:2px;text-decoration:none">See your application status</a>
</td></tr>
<tr><td style="padding:24px 32px 32px;font:15px/1.5 ${font};color:${ink}">Questions? Reply to this email or write to <a href="mailto:${esc(i.helpEmail)}" style="color:${ink}">${esc(i.helpEmail)}</a>.<br>The BTX Foundation</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid ${line};font:14px/1.5 ${font};color:${muted}">You&rsquo;re getting this because you applied for the ${esc(i.term)} ${esc(i.award)}. Application ${esc(i.code)}.</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
