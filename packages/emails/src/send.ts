// Sends one email through Resend's HTTP API when RESEND_API_KEY and a from-address are set; otherwise it only logs and
// does nothing, so nothing is ever sent from a preview or a laptop by accident. The key is read from the server's
// environment and is never committed. Each app passes its own from-address (the Portal PORTAL_EMAIL_FROM, the Ops Hub
// OPS_EMAIL_FROM). The Idempotency-Key header makes a repeated request (a double click, a retry) send once.
// OUTBOX FOR LOCAL TESTING: when EMAIL_DEV_OUTBOX is a folder path and NODE_ENV is not 'production', sendMail calls no
// one. It writes each email into that folder instead: <stamp>-<n>-<to>.html, a .json file next to it (to, subject, text,
// attachment names) and each attachment as <stamp>-<n>-<to>-<filename>. It reports success, so a whole flow can be run
// on a laptop and the files read afterwards. In production the variable is ignored.
export type Attachment = {
  filename: string;
  /** The file, base64 encoded (Resend's `content`). */
  content: string;
  /** Like 'text/calendar; method=REQUEST' (Resend's `content_type`). */
  contentType?: string;
};
export type Mail = { to: string; subject: string; html: string; text: string; idempotencyKey?: string; attachments?: Attachment[] };
export type SendResult = { sent: boolean; reason?: string; /** Resend's id for the message, when it was sent. */ id?: string };

// True when the server can really send email (key and from-address both set).
export function emailConfigured(from: string | undefined): boolean {
  return Boolean(process.env.RESEND_API_KEY && from);
}

let outboxCount = 0;

async function writeToOutbox(dir: string, mail: Mail): Promise<SendResult> {
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir(dir, { recursive: true });
  outboxCount += 1;
  const slug = mail.to.toLowerCase().replace(/[^a-z0-9@.]+/g, '-');
  const base = `${new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)}-${String(outboxCount).padStart(3, '0')}-${slug}`;
  await writeFile(`${dir}/${base}.html`, mail.html);
  await writeFile(`${dir}/${base}.json`, JSON.stringify({ to: mail.to, subject: mail.subject, text: mail.text, attachments: (mail.attachments ?? []).map((a) => a.filename) }, null, 2));
  for (const a of mail.attachments ?? []) await writeFile(`${dir}/${base}-${a.filename.replace(/[^\w.-]/g, '_')}`, Buffer.from(a.content, 'base64'));
  return { sent: true, id: `outbox-${base}` };
}

export async function sendMail(mail: Mail, from: string | undefined): Promise<SendResult> {
  const outbox = process.env.EMAIL_DEV_OUTBOX;
  if (outbox && process.env.NODE_ENV !== 'production') {
    try {
      return await writeToOutbox(outbox, mail);
    } catch (err) {
      console.error('[email] could not write to the dev outbox', err);
      return { sent: false, reason: 'outbox' };
    }
  }
  const key = process.env.RESEND_API_KEY;
  if (!key || !from) {
    console.log(`[email] not sent (RESEND_API_KEY or the from-address not set): "${mail.subject}" to ${mail.to}`);
    return { sent: false, reason: 'not-configured' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(mail.idempotencyKey ? { 'Idempotency-Key': mail.idempotencyKey } : {}),
      },
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text, ...(mail.attachments?.length ? { attachments: mail.attachments.map((a) => ({ filename: a.filename, content: a.content, ...(a.contentType ? { content_type: a.contentType } : {}) })) } : {}) }),
    });
    if (!res.ok) {
      console.error(`[email] Resend answered ${res.status} for "${mail.subject}"`);
      return { sent: false, reason: `resend-${res.status}` };
    }
    let id: string | undefined;
    try {
      const body = (await res.json()) as { id?: unknown };
      if (typeof body.id === 'string') id = body.id;
    } catch {
      // a body we cannot read does not undo a send
    }
    return { sent: true, id };
  } catch (err) {
    console.error('[email] could not reach Resend', err);
    return { sent: false, reason: 'network' };
  }
}
