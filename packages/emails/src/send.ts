// Sends one email through Resend's HTTP API when RESEND_API_KEY and a from-address are set; otherwise it only logs and
// does nothing, so nothing is ever sent from a preview or a laptop by accident. The key is read from the server's
// environment and is never committed. Each app passes its own from-address (the Portal PORTAL_EMAIL_FROM, the Ops Hub
// OPS_EMAIL_FROM). The Idempotency-Key header makes a repeated request (a double click, a retry) send once.
export type Mail = { to: string; subject: string; html: string; text: string; idempotencyKey?: string };
export type SendResult = { sent: boolean; reason?: string; /** Resend's id for the message, when it was sent. */ id?: string };

// True when the server can really send email (key and from-address both set).
export function emailConfigured(from: string | undefined): boolean {
  return Boolean(process.env.RESEND_API_KEY && from);
}

export async function sendMail(mail: Mail, from: string | undefined): Promise<SendResult> {
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
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
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
