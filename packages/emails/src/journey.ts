// The three emails on the student's path after she submits: "Interview times are open" (book your interview), and the
// two decision emails (you won, not picked). Content and layout follow the drafts (phase-a/portal/email.html,
// decision-won-email.html, decision-not-email.html): a white card on the grey page with the logo, a heading, a short
// paragraph, one gold button, a sign-off, and a quiet footer with the application number and the social links.
// Inline styles and tables only (mail apps strip the rest); the social links are text, not icons, because inline SVG
// does not survive mail apps. Pure functions that return strings. NOTHING SENDS THESE: staff actions in the Ops Hub
// will send them later, so there is no trigger anywhere in this app.
// Copy rules: the not-picked email never mentions other awards; the winner email says "Congratulations".
import { esc } from './confirmation';

export type JourneyEmailBase = {
  firstName: string;
  to: string;
  /** Like APP-2026-00016. */
  code: string;
  /** "Fall 2026" and "Legacy Scholarship". */
  term: string;
  award: string;
  /** Absolute address of the Portal, like https://apply.thebtxfoundation.org (no trailing slash). */
  origin: string;
  helpEmail: string;
};

const ink = '#15171a';
const muted = '#545a60';
const line = '#c9cec8';
const font = "'Google Sans Flex','Helvetica Neue',Arial,sans-serif";

type Shell = { title: string; preheader: string; heading: string; body: string; button: { label: string; href: string }; signoff: string; extra?: string };

function shell(i: JourneyEmailBase, s: Shell): string {
  const social = (label: string, href: string) => `<a href="${esc(href)}" style="color:${ink};text-decoration:none">${esc(label)}</a>`;
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(s.title)}</title>
<style>@media (max-width:480px){.o{padding:0 0 16px!important}.c{border-left:0!important;border-right:0!important}.pad{padding:24px 20px 28px!important}.h{font-size:30px!important}.f{padding:16px 20px 0!important}}</style></head>
<body style="margin:0;padding:0;background:#f4f5f2">
<div style="display:none;max-height:0;overflow:hidden">${esc(s.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f2"><tr><td class="o" align="center" style="padding:28px 12px 16px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" class="c" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${line}">
<tr><td class="pad" style="padding:28px 48px 32px">
<img src="${esc(i.origin)}/btx-logo-on-light.png" alt="The BTX Foundation" height="36" style="display:block;height:36px;width:auto;border:0">
<h1 class="h" style="margin:28px 0 0;font:500 34px/1.2 ${font};letter-spacing:-0.01em;color:${ink}">${esc(s.heading)}</h1>
${s.body}
<p style="margin:24px 0 0"><a href="${esc(s.button.href)}" style="display:inline-block;background:#c99b31;color:${ink};font:600 16px/1 ${font};padding:18px 26px;border-radius:2px;text-decoration:none">${esc(s.button.label)}</a></p>
${s.extra ?? ''}
<p style="margin:16px 0 0;font:16px/1.5 ${font};color:${ink}">${esc(s.signoff)}</p>
</td></tr>
</table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px"><tr><td class="f" align="center" style="padding:16px 0 0;font:14px/1.5 ${font};color:${muted}">
You&rsquo;re getting this because you applied for the ${esc(i.term).replace(/ /g, '&nbsp;')} ${esc(i.award)}. <span style="white-space:nowrap">Application ${esc(i.code)}.</span>
<br><span style="display:inline-block;margin-top:8px">${social('Instagram @btxfoundation', 'https://www.instagram.com/btxfoundation')} &nbsp;&nbsp; ${social('LinkedIn BTX Foundation', 'https://www.linkedin.com/company/thebtxfoundation/')}</span>
</td></tr></table>
</td></tr></table>
</body></html>`;
}

const p = (text: string, top = 12) => `<p style="margin:${top}px 0 0;font:16px/1.5 ${font};color:${ink}">${text}</p>`;
const small = (text: string, top: number) => `<p style="margin:${top}px 0 0;font:15px/1.5 ${font};color:${muted}">${text}</p>`;

// ---- Book your interview ---------------------------------------------------------------------------------------

export type BookEmailInput = JourneyEmailBase & {
  /** The last day to pick a time, like "Fri Oct 9". */
  bookBy: string;
};

export const bookSubject = (i: Pick<BookEmailInput, 'bookBy'>) => `Schedule your interview by ${i.bookBy}`;
const bookUrl = (i: JourneyEmailBase) => `${i.origin}/status/schedule`;

export function bookHtml(i: BookEmailInput): string {
  return shell(i, {
    title: bookSubject(i),
    preheader: `Pick your 30-minute video interview by ${i.bookBy}.`,
    heading: 'Interview times are open.',
    body:
      p(`Hi ${esc(i.firstName)}, please pick one by ${esc(i.bookBy)}.`) +
      `<p style="margin:18px 0 0;font:500 16px/1.4 ${font};color:${ink}">30 minutes &nbsp;&nbsp;&middot;&nbsp;&nbsp; Video call</p>`,
    button: { label: 'Book your interview', href: bookUrl(i) },
    extra: small("None of the times work? Tell us when you're free on that page.", 20) + small('Questions? Reply to this email.', 4),
    signoff: 'The BTX Foundation',
  }).replace('margin:16px 0 0;font:16px/1.5', 'margin:20px 0 0;font:16px/1.5');
}

export function bookText(i: BookEmailInput): string {
  return [
    `Hi ${i.firstName}, please pick a time for your interview by ${i.bookBy}.`,
    '',
    '30 minutes, video call.',
    '',
    `Book your interview: ${bookUrl(i)}`,
    '',
    "None of the times work? Tell us when you're free on that page.",
    'Questions? Reply to this email.',
    '',
    'The BTX Foundation',
    '',
    `You're getting this because you applied for the ${i.term} ${i.award}. Application ${i.code}.`,
  ].join('\n');
}

// ---- Decision: you won -----------------------------------------------------------------------------------------

export type WonEmailInput = JourneyEmailBase & {
  /** The award amount, like "$2,000" (or the "[amount]" placeholder). */
  amount: string;
  /** When the photo and story are due, like "Fri Nov 6" (or "[date]"). */
  photoDue: string;
};

export const wonSubject = (i: Pick<WonEmailInput, 'award'>) => `You won the ${i.award}`;
const storyUrl = (i: JourneyEmailBase) => `${i.origin}/status/story`;

export function wonHtml(i: WonEmailInput): string {
  return shell(i, {
    title: wonSubject(i),
    preheader: `The board picked you for the ${i.term} ${i.award}.`,
    heading: `Congratulations, ${i.firstName}.`,
    body: p(`The board picked you for the ${esc(i.term)} ${esc(i.award)}: ${esc(i.amount)}. Please send a photo and a few lines for your scholar page by&nbsp;${esc(i.photoDue)}.`),
    button: { label: 'Add your photo and story', href: storyUrl(i) },
    extra: p('Questions? Reply to this email.', 16),
    signoff: 'The BTX Foundation board',
  });
}

export function wonText(i: WonEmailInput): string {
  return [
    `Congratulations, ${i.firstName}.`,
    '',
    `The board picked you for the ${i.term} ${i.award}: ${i.amount}. Please send a photo and a few lines for your scholar page by ${i.photoDue}.`,
    '',
    `Add your photo and story: ${storyUrl(i)}`,
    '',
    'Questions? Reply to this email.',
    '',
    'The BTX Foundation board',
    '',
    `You're getting this because you applied for the ${i.term} ${i.award}. Application ${i.code}.`,
  ].join('\n');
}

// ---- Decision: not picked (never mentions other awards) --------------------------------------------------------

export type NotPickedEmailInput = JourneyEmailBase;

export const notPickedSubject = (i: Pick<NotPickedEmailInput, 'award'>) => `Your ${i.award} application`;
const statusUrl = (i: JourneyEmailBase) => `${i.origin}/status`;

export function notPickedHtml(i: NotPickedEmailInput): string {
  return shell(i, {
    title: notPickedSubject(i),
    preheader: `An update on your ${i.term} ${i.award} application.`,
    heading: `Thank you, ${i.firstName}.`,
    body:
      p(`The board picked another applicant for the ${esc(i.term)} ${esc(i.award)}. Thank you for applying, and for your interview.`) +
      p('Reply to this email for a few notes from your&nbsp;interviewers.'),
    button: { label: 'See other ways BTX can help', href: statusUrl(i) },
    signoff: 'The BTX Foundation board',
  });
}

export function notPickedText(i: NotPickedEmailInput): string {
  return [
    `Thank you, ${i.firstName}.`,
    '',
    `The board picked another applicant for the ${i.term} ${i.award}. Thank you for applying, and for your interview.`,
    '',
    'Reply to this email for a few notes from your interviewers.',
    '',
    `See other ways BTX can help: ${statusUrl(i)}`,
    '',
    'The BTX Foundation board',
    '',
    `You're getting this because you applied for the ${i.term} ${i.award}. Application ${i.code}.`,
  ].join('\n');
}
