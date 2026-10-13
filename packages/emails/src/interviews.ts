// The interview emails: the interviewers' prep email, the student's reminder, "booked", "video link", the rebalance
// notes and "cancelled". Same look as journey.ts (white card on the grey page, the logo, a heading, a short paragraph,
// one gold button, a quiet footer), inline styles and tables only. Pure functions that return { subject, html, text }.
// Times are Eastern, like "Thu Nov 12, 7:00 PM". Names are full names (board members see names everywhere).
// Copy rules: nothing in an applicant email mentions other awards. NOTHING SENDS THESE here; the senders are in the
// Ops Hub (lib/email/interviews.ts) and the Portal's booking route.
import { esc } from './confirmation';

export type Rendered = { subject: string; html: string; text: string };

const ink = '#15171a';
const muted = '#545a60';
const line = '#c9cec8';
const font = "'Google Sans Flex','Helvetica Neue',Arial,sans-serif";
const mono = "'Google Sans Code',Consolas,monospace";

// ---- Eastern time ----------------------------------------------------------------------------------------------

const part = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', ...opts }).format(new Date(iso)).replace(',', '');

/** "Thu Nov 12, 7:00 PM" */
export function easternWhen(iso: string): string {
  return `${part(iso, { weekday: 'short', month: 'short', day: 'numeric' })}, ${easternClock(iso)}`;
}
/** "Thu Nov 12" */
export const easternDay = (iso: string) => part(iso, { weekday: 'short', month: 'short', day: 'numeric' });
/** "7:00 PM" */
export const easternClock = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
/** "2026-11-12": the Eastern calendar day of an instant. */
export const easternDate = (iso: string | Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(iso));
/** Minutes between two instants, like "30 minutes". */
export const lengthLabel = (startsAt: string, endsAt: string) => `${Math.max(1, Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60000))} minutes`;

// ---- shared pieces ---------------------------------------------------------------------------------------------

type Shell = { title: string; preheader: string; heading: string; body: string; button?: { label: string; href: string }; extra?: string; signoff?: string; footer: string; origin: string };

function shell(s: Shell): string {
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
<img src="${esc(s.origin)}/btx-logo-on-light.png" alt="The BTX Foundation" height="36" style="display:block;height:36px;width:auto;border:0">
<h1 class="h" style="margin:28px 0 0;font:500 34px/1.2 ${font};letter-spacing:-0.01em;color:${ink}">${esc(s.heading)}</h1>
${s.body}
${s.button ? `<p style="margin:24px 0 0"><a href="${esc(s.button.href)}" style="display:inline-block;background:#c99b31;color:${ink};font:600 16px/1 ${font};padding:18px 26px;border-radius:2px;text-decoration:none">${esc(s.button.label)}</a></p>` : ''}
${s.extra ?? ''}
${s.signoff ? `<p style="margin:20px 0 0;font:16px/1.5 ${font};color:${ink}">${esc(s.signoff)}</p>` : ''}
</td></tr>
</table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px"><tr><td class="f" align="center" style="padding:16px 0 0;font:14px/1.5 ${font};color:${muted}">
${s.footer}
<br><span style="display:inline-block;margin-top:8px">${social('Instagram @btxfoundation', 'https://www.instagram.com/btxfoundation')} &nbsp;&nbsp; ${social('LinkedIn BTX Foundation', 'https://www.linkedin.com/company/thebtxfoundation/')}</span>
</td></tr></table>
</td></tr></table>
</body></html>`;
}

const p = (text: string, top = 12) => `<p style="margin:${top}px 0 0;font:16px/1.5 ${font};color:${ink}">${text}</p>`;
const small = (text: string, top: number) => `<p style="margin:${top}px 0 0;font:15px/1.5 ${font};color:${muted}">${text}</p>`;
const facts = (text: string) => `<p style="margin:18px 0 0;font:500 16px/1.4 ${font};color:${ink}">${esc(text)}</p>`;
const link = (url: string) => `<p style="margin:12px 0 0;font:15px/1.5 ${font};color:${ink}"><a href="${esc(url)}" style="color:${ink}">${esc(url.replace(/^https?:\/\//, ''))}</a></p>`;
const rule = `<div style="margin:24px 0 0;border-top:1px solid ${line};height:0;line-height:0">&nbsp;</div>`;
const code = (c: string) => `<span style="font-family:${mono};letter-spacing:0.05em">${esc(c)}</span>`;

const studentFooter = (i: { term: string; award: string; code: string }) =>
  `You&rsquo;re getting this because you applied for the ${esc(i.term).replace(/ /g, '&nbsp;')} ${esc(i.award)}. <span style="white-space:nowrap">Application ${code(i.code)}.</span>`;
const interviewerFooter = (i: { term: string; award: string }) => `You&rsquo;re getting this because you interview for the ${esc(i.term)} ${esc(i.award)}.`;

const VIDEO_LATER = 'The video link will come before the interview.';
const firstOf = (name: string) => name.trim().split(/\s+/)[0] || 'there';
const joinNames = (names: string[]) => (names.length <= 1 ? (names[0] ?? '') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]);

// ---- questions, grouped by rubric criterion --------------------------------------------------------------------

export type QuestionGroup = { title: string; questions: string[] };

/** The cycle's questions grouped by rubric criterion name, in the rubric's order, with "To close" (no criterion) last. */
export function groupQuestions(
  questions: { criterionKey: string | null; position: number; text: string }[],
  criteria: { key: string; name: string; position?: number }[],
): QuestionGroup[] {
  const byPos = (a: { position: number }, b: { position: number }) => a.position - b.position;
  const groups: QuestionGroup[] = [];
  const ordered = criteria.map((c, i) => ({ ...c, order: c.position ?? i })).sort((a, b) => a.order - b.order);
  const used = new Set<string>();
  for (const c of ordered) {
    const qs = questions.filter((q) => q.criterionKey === c.key).sort(byPos);
    if (qs.length) groups.push({ title: c.name, questions: qs.map((q) => q.text) });
    used.add(c.key);
  }
  // a question whose criterion is not in the list stays visible, under its key
  for (const key of [...new Set(questions.map((q) => q.criterionKey).filter((k): k is string => !!k && !used.has(k)))]) {
    groups.push({ title: key, questions: questions.filter((q) => q.criterionKey === key).sort(byPos).map((q) => q.text) });
  }
  const close = questions.filter((q) => q.criterionKey === null).sort(byPos);
  if (close.length) groups.push({ title: 'To close', questions: close.map((q) => q.text) });
  return groups;
}

// A long answer is cut at a word, like the scorecard's preview.
function clip(text: string, max = 420): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

export const ANSWER_LABELS = ['A community you’re part of', 'A class that pushed you', 'The problem you want to work on'] as const;

// ---- Interviewer prep (the evening before) ---------------------------------------------------------------------

export type PrepInput = {
  firstName: string;
  /** The other interviewer's full name. */
  otherName: string;
  applicantName: string;
  code: string;
  startsAt: string;
  endsAt: string;
  videoUrl: string | null;
  /** The applicant's three short answers (answer_1..3); empty or null ones are left out. */
  answers: (string | null)[];
  scorecardUrl: string;
  questions: QuestionGroup[];
  term: string;
  award: string;
  /** The Portal's address, for the logo. */
  origin: string;
};

export function prepEmail(i: PrepInput): Rendered {
  const subject = `Your BTX interview tomorrow: ${i.applicantName}, ${i.code} at ${easternClock(i.startsAt)}`;
  const answers = i.answers.map((a, n) => ({ label: ANSWER_LABELS[n] ?? `Answer ${n + 1}`, text: (a ?? '').trim() })).filter((a) => a.text);
  const nq = i.questions.reduce((n, g) => n + g.questions.length, 0);
  const answersHtml = answers.length
    ? `<p style="margin:0;font:600 18px/1.35 ${font};color:${ink}">Their three short answers</p>` +
      answers.map((a) => `<p style="margin:14px 0 0;font:600 14px/1.4 ${font};color:${muted}">${esc(a.label)}</p><p style="margin:2px 0 0;font:15px/1.4 ${font};color:${ink}">${esc(clip(a.text))}</p>`).join('')
    : '';
  const questionsHtml = nq
    ? `<p style="margin:24px 0 0;font:600 18px/1.35 ${font};color:${ink}">The interview questions</p>` +
      i.questions
        .map(
          (g) =>
            `<p style="margin:14px 0 0;font:600 14px/1.4 ${font};color:${muted}">${esc(g.title)}</p>` +
            g.questions.map((q) => `<p style="margin:4px 0 0;font:15px/1.4 ${font};color:${ink}">&ndash;&nbsp;${esc(q)}</p>`).join(''),
        )
        .join('')
    : '';
  const html = shell({
    origin: i.origin,
    title: subject,
    preheader: `You and ${i.otherName} interview ${i.applicantName} at ${easternClock(i.startsAt)}.`,
    heading: `Tomorrow at ${easternClock(i.startsAt)}.`,
    body:
      p(`Hi ${esc(firstOf(i.firstName))}. You and ${esc(i.otherName)} interview ${esc(i.applicantName)} (${code(i.code)}).`) +
      facts(`${easternDay(i.startsAt)} · ${lengthLabel(i.startsAt, i.endsAt)}`) +
      (i.videoUrl ? link(i.videoUrl) : p(esc(VIDEO_LATER), 12)),
    button: { label: 'Open the scorecard', href: i.scorecardUrl },
    extra: (answersHtml || questionsHtml ? rule + `<div style="margin-top:20px">${answersHtml}${questionsHtml}</div>` : '') + small('Can&rsquo;t make it? Reply to this email.', 24),
    footer: interviewerFooter(i),
  });
  const text = [
    `Tomorrow at ${easternClock(i.startsAt)}.`,
    '',
    `Hi ${firstOf(i.firstName)}. You and ${i.otherName} interview ${i.applicantName} (${i.code}).`,
    '',
    `${easternDay(i.startsAt)} · ${lengthLabel(i.startsAt, i.endsAt)}`,
    i.videoUrl ?? VIDEO_LATER,
    '',
    `Open the scorecard: ${i.scorecardUrl}`,
    ...(answers.length ? ['', 'Their three short answers', ...answers.flatMap((a) => ['', a.label, clip(a.text)])] : []),
    ...(nq ? ['', 'The interview questions', ...i.questions.flatMap((g) => ['', g.title, ...g.questions.map((q) => `- ${q}`)])] : []),
    '',
    "Can't make it? Reply to this email.",
    '',
    interviewerFooterText(i),
  ].join('\n');
  return { subject, html, text };
}

const interviewerFooterText = (i: { term: string; award: string }) => `You're getting this because you interview for the ${i.term} ${i.award}.`;
const studentFooterText = (i: { term: string; award: string; code: string }) => `You're getting this because you applied for the ${i.term} ${i.award}. Application ${i.code}.`;

// ---- Student reminder (the day before, 9:00 AM) ----------------------------------------------------------------

export type ReminderInput = {
  firstName: string;
  startsAt: string;
  endsAt: string;
  videoUrl: string | null;
  /** The two interviewers' full names; empty when nobody is paired yet. */
  interviewers: string[];
  /** Where she changes her time, like https://apply.thebtxfoundation.org/status/change. */
  changeUrl: string;
  code: string;
  term: string;
  award: string;
  origin: string;
};

export function reminderEmail(i: ReminderInput): Rendered {
  const subject = `Your BTX interview is tomorrow at ${easternClock(i.startsAt)}`;
  const who = i.interviewers.length ? `${joinNames(i.interviewers)} will interview you.` : '';
  const html = shell({
    origin: i.origin,
    title: subject,
    preheader: `${easternWhen(i.startsAt)}, by video.`,
    heading: `Tomorrow at ${easternClock(i.startsAt)}, ${firstOf(i.firstName)}.`,
    body: facts(`${easternDay(i.startsAt)} · ${lengthLabel(i.startsAt, i.endsAt)} · Video call`) + (who ? p(esc(who), 14) : '') + (i.videoUrl ? '' : p(esc(VIDEO_LATER), 14)),
    button: i.videoUrl ? { label: 'Join the video call', href: i.videoUrl } : undefined,
    extra:
      (i.videoUrl ? link(i.videoUrl) : '') +
      `<p style="margin:16px 0 0;font:15px/1.5 ${font};color:${ink}">Can&rsquo;t make it? <a href="${esc(i.changeUrl)}" style="color:${ink}">Change your time</a></p>` +
      small('Questions? Reply to this email.', 16),
    signoff: 'The BTX Foundation',
    footer: studentFooter(i),
  });
  const text = [
    `Tomorrow at ${easternClock(i.startsAt)}, ${firstOf(i.firstName)}.`,
    '',
    `${easternDay(i.startsAt)} · ${lengthLabel(i.startsAt, i.endsAt)} · Video call`,
    ...(who ? [who] : []),
    i.videoUrl ? `Join the video call: ${i.videoUrl}` : VIDEO_LATER,
    '',
    `Can't make it? Change your time: ${i.changeUrl}`,
    'Questions? Reply to this email.',
    '',
    'The BTX Foundation',
    '',
    studentFooterText(i),
  ].join('\n');
  return { subject, html, text };
}

// ---- Booked ------------------------------------------------------------------------------------------------------

type Who = { audience: 'student' } | { audience: 'interviewer' };

export type BookedInput = Who & {
  firstName: string;
  applicantName: string;
  code: string;
  startsAt: string;
  endsAt: string;
  videoUrl: string | null;
  /** Student: both interviewers. Interviewer: the OTHER interviewer (one name). */
  others: string[];
  /** Student only: where she changes her time. */
  changeUrl?: string;
  /** Student only: she switched from another time ("Your interview moved to ..."). */
  moved?: boolean;
  term: string;
  award: string;
  origin: string;
};

export function bookedEmail(i: BookedInput): Rendered {
  const student = i.audience === 'student';
  const when = easternWhen(i.startsAt);
  const subject = student ? (i.moved ? `Your interview moved to ${when}` : `Your interview is booked: ${when}`) : `Interview booked: ${when}, ${i.applicantName}`;
  const lead = student
    ? `Hi ${firstOf(i.firstName)}. ${i.others.length ? `${joinNames(i.others)} will interview you.` : 'We will email you who will interview you.'}`
    : `Hi ${firstOf(i.firstName)}. ${i.others.length ? `You and ${joinNames(i.others)} interview` : 'You interview'} ${i.applicantName} (${i.code}).`;
  const html = shell({
    origin: i.origin,
    title: subject,
    preheader: `${when}, by video. A calendar invite is attached.`,
    heading: student ? (i.moved ? 'Your interview moved.' : 'Your interview is booked.') : 'An interview is booked.',
    body: facts(`${when} · ${lengthLabel(i.startsAt, i.endsAt)} · Video call`) + p(esc(lead), 14) + (i.videoUrl ? link(i.videoUrl) : p(esc(VIDEO_LATER), 12)),
    button: student && i.changeUrl ? { label: 'Change your time', href: i.changeUrl } : undefined,
    extra: small('A calendar invite is attached' + (student && i.moved ? ', and it moves the one already on your calendar' : '') + '. Questions? Reply to this email.', 20),
    signoff: 'The BTX Foundation',
    footer: student ? studentFooter(i) : interviewerFooter(i),
  });
  const text = [
    student ? (i.moved ? 'Your interview moved.' : 'Your interview is booked.') : 'An interview is booked.',
    '',
    `${when} · ${lengthLabel(i.startsAt, i.endsAt)} · Video call`,
    lead,
    i.videoUrl ?? VIDEO_LATER,
    ...(student && i.changeUrl ? ['', `Change your time: ${i.changeUrl}`] : []),
    '',
    `A calendar invite is attached${student && i.moved ? ', and it moves the one already on your calendar' : ''}. Questions? Reply to this email.`,
    '',
    'The BTX Foundation',
    '',
    student ? studentFooterText(i) : interviewerFooterText(i),
  ].join('\n');
  return { subject, html, text };
}

// ---- Video link saved ------------------------------------------------------------------------------------------

export type VideoLinkInput = Who & {
  firstName: string;
  applicantName: string;
  code: string;
  startsAt: string;
  videoUrl: string;
  term: string;
  award: string;
  origin: string;
};

export function videoLinkEmail(i: VideoLinkInput): Rendered {
  const student = i.audience === 'student';
  const when = easternWhen(i.startsAt);
  const subject = `Video link for ${when}`;
  const lead = student ? `Hi ${firstOf(i.firstName)}. Here is the link for your interview on ${when}.` : `Hi ${firstOf(i.firstName)}. Here is the link for your interview with ${i.applicantName} (${i.code}) on ${when}.`;
  const html = shell({
    origin: i.origin,
    title: subject,
    preheader: `Your video link for ${when}.`,
    heading: 'Your video link is ready.',
    body: p(esc(lead)) + link(i.videoUrl),
    button: { label: 'Join the video call', href: i.videoUrl },
    extra: small('Questions? Reply to this email.', 20),
    signoff: 'The BTX Foundation',
    footer: student ? studentFooter(i) : interviewerFooter(i),
  });
  const text = [
    'Your video link is ready.',
    '',
    lead,
    `Join the video call: ${i.videoUrl}`,
    '',
    'Questions? Reply to this email.',
    '',
    'The BTX Foundation',
    '',
    student ? studentFooterText(i) : interviewerFooterText(i),
  ].join('\n');
  return { subject, html, text };
}

// ---- Rebalance: the interviewer added and the one removed ------------------------------------------------------

export type RebalanceInput = {
  /** 'added' = "You're now interviewing"; 'removed' = "You're no longer interviewing". */
  change: 'added' | 'removed';
  firstName: string;
  applicantName: string;
  code: string;
  startsAt: string;
  endsAt: string;
  videoUrl: string | null;
  /** Added: the interviewer you join. */
  otherName?: string;
  /** Added: the scorecard. */
  scorecardUrl?: string;
  term: string;
  award: string;
  origin: string;
};

export function rebalanceEmail(i: RebalanceInput): Rendered {
  const added = i.change === 'added';
  const when = easternWhen(i.startsAt);
  const subject = added ? `You're now interviewing ${i.applicantName}, ${when}` : `You're no longer interviewing ${i.applicantName}, ${when}`;
  const lead = added
    ? `Hi ${firstOf(i.firstName)}. The board moved this interview to you${i.otherName ? `. You and ${i.otherName} interview` : '. You interview'} ${i.applicantName} (${i.code}).`
    : `Hi ${firstOf(i.firstName)}. The board moved your ${when} interview with ${i.applicantName} (${i.code}) to another board member. Nothing to do.`;
  const html = shell({
    origin: i.origin,
    title: subject,
    preheader: added ? `${when}, by video. A calendar invite is attached.` : `${when}. It is off your calendar.`,
    heading: added ? `You’re now interviewing ${i.applicantName}.` : `You’re no longer interviewing ${i.applicantName}.`,
    body: (added ? facts(`${when} · ${lengthLabel(i.startsAt, i.endsAt)} · Video call`) : '') + p(esc(lead), 14) + (added ? (i.videoUrl ? link(i.videoUrl) : p(esc(VIDEO_LATER), 12)) : ''),
    button: added && i.scorecardUrl ? { label: 'Open the scorecard', href: i.scorecardUrl } : undefined,
    extra: small(added ? 'A calendar invite is attached. Can&rsquo;t make it? Reply to this email.' : 'A calendar update is attached, so it comes off your calendar.', 20),
    footer: interviewerFooter(i),
  });
  const text = [
    added ? `You're now interviewing ${i.applicantName}.` : `You're no longer interviewing ${i.applicantName}.`,
    '',
    ...(added ? [`${when} · ${lengthLabel(i.startsAt, i.endsAt)} · Video call`] : []),
    lead,
    ...(added ? [i.videoUrl ?? VIDEO_LATER, ...(i.scorecardUrl ? ['', `Open the scorecard: ${i.scorecardUrl}`] : [])] : []),
    '',
    added ? "A calendar invite is attached. Can't make it? Reply to this email." : 'A calendar update is attached, so it comes off your calendar.',
    '',
    interviewerFooterText(i),
  ].join('\n');
  return { subject, html, text };
}

// ---- Cancelled: the student moved to another time --------------------------------------------------------------

export type CancelInput = {
  firstName: string;
  applicantName: string;
  code: string;
  startsAt: string;
  term: string;
  award: string;
  origin: string;
};

export function cancelEmail(i: CancelInput): Rendered {
  const when = easternWhen(i.startsAt);
  const subject = `Interview cancelled: ${when}`;
  const lead = `Hi ${firstOf(i.firstName)}. ${i.applicantName} (${i.code}) moved to another time, so your ${when} interview is cancelled.`;
  const html = shell({
    origin: i.origin,
    title: subject,
    preheader: `${when} is off your calendar.`,
    heading: 'This interview moved.',
    body: p(esc(lead)),
    extra: small('A calendar update is attached, so it comes off your calendar.', 20),
    footer: interviewerFooter(i),
  });
  const text = ['This interview moved.', '', lead, '', 'A calendar update is attached, so it comes off your calendar.', '', interviewerFooterText(i)].join('\n');
  return { subject, html, text };
}

/** The description line inside the calendar invite. */
export function inviteDescription(i: { applicantName: string; code: string; interviewers: string[]; videoUrl: string | null }): string {
  return [`Interview with ${i.applicantName} (${i.code}).`, i.interviewers.length ? `Interviewers: ${joinNames(i.interviewers)}.` : '', i.videoUrl ? `Video call: ${i.videoUrl}` : VIDEO_LATER].filter(Boolean).join('\n');
}
