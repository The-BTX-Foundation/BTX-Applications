import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendMail } from '@btx/emails';

afterEach(() => vi.unstubAllEnvs());

describe('the local email outbox', () => {
  it('writes html, json and attachments to the folder instead of calling Resend', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'outbox-'));
    vi.stubEnv('EMAIL_DEV_OUTBOX', dir);
    vi.stubEnv('NODE_ENV', 'development');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const r = await sendMail({ to: 'Ada@Terpmail.umd.edu', subject: 'Hello', html: '<p>Hi</p>', text: 'Hi', attachments: [{ filename: 'btx-interview.ics', content: Buffer.from('ICS').toString('base64') }] }, 'x@y.org');
    expect(r.sent).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    const files = readdirSync(dir).sort();
    expect(files).toHaveLength(3);
    const json = JSON.parse(readFileSync(join(dir, files.find((f) => f.endsWith('.json'))!), 'utf8'));
    expect(json).toEqual({ to: 'Ada@Terpmail.umd.edu', subject: 'Hello', text: 'Hi', attachments: ['btx-interview.ics'] });
    expect(readFileSync(join(dir, files.find((f) => f.endsWith('.ics'))!), 'utf8')).toBe('ICS');
    expect(readFileSync(join(dir, files.find((f) => f.endsWith('.html'))!), 'utf8')).toBe('<p>Hi</p>');
    fetchSpy.mockRestore();
  });

  it('is ignored in production', async () => {
    vi.stubEnv('EMAIL_DEV_OUTBOX', '/nonexistent');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RESEND_API_KEY', '');
    expect(await sendMail({ to: 'a@b.c', subject: 's', html: 'h', text: 't' }, undefined)).toEqual({ sent: false, reason: 'not-configured' });
  });

  it('sends attachments to Resend with content_type', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('EMAIL_DEV_OUTBOX', '');
    vi.stubEnv('RESEND_API_KEY', 'k');
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'r1' }), { status: 200 }));
    await sendMail({ to: 'a@b.c', subject: 's', html: 'h', text: 't', attachments: [{ filename: 'a.ics', content: 'QQ==', contentType: 'text/calendar; method=REQUEST' }] }, 'from@x.org');
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.attachments).toEqual([{ filename: 'a.ics', content: 'QQ==', content_type: 'text/calendar; method=REQUEST' }]);
    spy.mockRestore();
  });
});
