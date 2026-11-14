// The staff alert "Name asked for other interview times": a student with no interview time sent the times she is free
// ("None of these times work" in the Portal). Goes to info@thebtxfoundation.org so the board knows someone is waiting
// for a time. Plain and short, text first, like the staff invite. Pure strings.
import { esc } from './confirmation';
import { freeRangeLines, oldAnswerLine, sentLabel } from './free-times';

/** The shared BTX inbox the alert goes to. */
export const FREE_TIMES_ALERT_TO = 'info@thebtxfoundation.org';

export type FreeTimesAlertInput = {
  /** The student's full name ("Ada Okafor"); the code is used when there is no name. */
  name: string;
  /** "APP-2026-00011". */
  code: string;
  /** What she typed, or empty. */
  said: string;
  /** Her stored ranges (any value; unusable ranges are left out). */
  ranges: unknown;
  /** Older answers only: days of the week and parts of the day. */
  days?: string[] | null;
  windows?: string[] | null;
  /** The Ops Hub's Interviews page, absolute ("https://ops.thebtxfoundation.org/scholarships/interviews#iz-oth"). */
  interviewsUrl: string;
  /** When she sent it (an instant). */
  sentAt: string;
};

// Her name for the subject and first line: the name, else the code.
const who = (i: FreeTimesAlertInput) => i.name.trim() || i.code || 'A student';

/** "Ada Okafor asked for other interview times". */
export function freeTimesAlertSubject(i: FreeTimesAlertInput): string {
  return `${who(i)} asked for other interview times`;
}

// The lines of her free times: her ranges in Eastern time, else her older days-and-parts answer.
function lines(i: FreeTimesAlertInput): string[] {
  const r = freeRangeLines(i.ranges);
  if (r.length > 0) return r;
  const old = oldAnswerLine(i.days, i.windows);
  return old ? [old] : [];
}

/** The plain-text body. */
export function freeTimesAlertText(i: FreeTimesAlertInput): string {
  const free = lines(i);
  const said = i.said.trim();
  return [
    'Hi team,',
    '',
    `${who(i)}${i.code && i.name.trim() ? ` (${i.code})` : ''} hasn't booked an interview and says none of the open times work.`,
    ...(said ? ['', `In their words: "${said}"`] : []),
    ...(free.length ? ['', 'Free times (Eastern):', ...free.map((l) => `- ${l}`)] : []),
    '',
    `Add or open a time that fits on the Interviews page: ${i.interviewsUrl}`,
    '',
    `Sent from the BTX Portal ${sentLabel(i.sentAt)}.`,
  ].join('\n');
}

/** The HTML body (inline styles only; mail apps strip the rest). */
export function freeTimesAlertHtml(i: FreeTimesAlertInput): string {
  const font = "'Google Sans Flex','Helvetica Neue',Arial,sans-serif";
  const free = lines(i);
  const said = i.said.trim();
  const code = i.code && i.name.trim() ? ` (${esc(i.code)})` : '';
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(freeTimesAlertSubject(i))}</title></head>
<body style="margin:0;padding:24px 16px;background:#ffffff;font:16px/1.5 ${font};color:#15171a">
<p style="margin:0">Hi team,</p>
<p style="margin:16px 0 0">${esc(who(i))}${code} hasn&rsquo;t booked an interview and says none of the open times work.</p>
${said ? `<p style="margin:16px 0 0">In their words: &ldquo;${esc(said)}&rdquo;</p>` : ''}
${free.length ? `<p style="margin:16px 0 0">Free times (Eastern):</p><ul style="margin:4px 0 0;padding-left:20px">${free.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
<p style="margin:16px 0 0">Add or open a time that fits on the <a href="${esc(i.interviewsUrl)}" style="color:#15171a">Interviews page</a>.</p>
<p style="margin:16px 0 0;color:#545a60;font-size:14px">Sent from the BTX Portal ${esc(sentLabel(i.sentAt))}.</p>
</body></html>`;
}
