// Sends one email through Resend's HTTP API when RESEND_API_KEY is set; otherwise it only logs and does nothing, so
// nothing is ever sent from a preview or a laptop by accident. The key is read from the server's environment and is
// never committed. The Idempotency-Key header makes a repeated request (a double click, a retry) send once.
export type Mail = { to: string; subject: string; html: string; text: string; idempotencyKey?: string };

export async function sendMail(mail: Mail): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.PORTAL_EMAIL_FROM;
  if (!key || !from) {
    console.log(`[email] not sent (RESEND_API_KEY or PORTAL_EMAIL_FROM not set): "${mail.subject}" to ${mail.to}`);
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
    return { sent: true };
  } catch (err) {
    console.error('[email] could not reach Resend', err);
    return { sent: false, reason: 'network' };
  }
}
