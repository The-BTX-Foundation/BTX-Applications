// The staff invite email: plain and short, text first. Sent from the Ops Hub when an admin adds a person.
import { esc } from './confirmation';

export type StaffInviteInput = {
  name: string;
  to: string;
  /** "Admin" or "Board member" (the only staff roles). */
  role: string;
  /** Where staff sign in, like https://ops.thebtxfoundation.org. */
  opsUrl: string;
};

export const staffInviteSubject = (i: Pick<StaffInviteInput, 'role'>) => `You're on the BTX Ops Hub as ${i.role}`;

export function staffInviteText(i: StaffInviteInput): string {
  return [
    `Hi ${i.name},`,
    '',
    `You're on the BTX Ops Hub as ${i.role}. Sign in at ${i.opsUrl} with this email address; we'll send you a code.`,
    '',
    'The BTX Foundation',
  ].join('\n');
}

export function staffInviteHtml(i: StaffInviteInput): string {
  const font = "'Google Sans Flex','Helvetica Neue',Arial,sans-serif";
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(staffInviteSubject(i))}</title></head>
<body style="margin:0;padding:24px 16px;background:#ffffff;font:16px/1.5 ${font};color:#15171a">
<p style="margin:0">Hi ${esc(i.name)},</p>
<p style="margin:16px 0 0">You&rsquo;re on the BTX Ops Hub as ${esc(i.role)}. Sign in at <a href="${esc(i.opsUrl)}" style="color:#15171a">${esc(i.opsUrl)}</a> with this email address; we&rsquo;ll send you a code.</p>
<p style="margin:16px 0 0">The BTX Foundation</p>
</body></html>`;
}
