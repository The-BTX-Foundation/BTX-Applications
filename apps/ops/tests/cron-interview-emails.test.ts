import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prep, reminder } = vi.hoisted(() => ({
  prep: vi.fn(async () => ({ ok: true, kind: 'prep', sent: 2, skipped: 0, failed: 0, notConfigured: false, at: 'x' })),
  reminder: vi.fn(async () => ({ ok: true, kind: 'reminder', sent: 1, skipped: 0, failed: 0, notConfigured: false, at: 'x' })),
}));
vi.mock('@/lib/email/interviews', () => ({ sendPrepEmails: prep, sendReminderEmails: reminder }));

import { GET } from '@/app/api/cron/interview-emails/route';

const call = (qs: string, auth?: string) => GET(new Request(`https://ops.example.org/api/cron/interview-emails${qs}`, { headers: auth ? { authorization: auth } : {} }));

describe('GET /api/cron/interview-emails', () => {
  beforeEach(() => {
    prep.mockClear();
    reminder.mockClear();
    vi.stubEnv('CRON_SECRET', 'shh');
  });

  it('refuses without the bearer secret, with the wrong one, or when no secret is set', async () => {
    expect((await call('?kind=prep')).status).toBe(401);
    expect((await call('?kind=prep', 'Bearer nope')).status).toBe(401);
    vi.stubEnv('CRON_SECRET', '');
    expect((await call('?kind=prep', 'Bearer ')).status).toBe(401);
    expect(prep).not.toHaveBeenCalled();
  });

  it('runs prep and reminder and returns the counts', async () => {
    const a = await call('?kind=prep', 'Bearer shh');
    expect(a.status).toBe(200);
    expect(await a.json()).toMatchObject({ ok: true, kind: 'prep', sent: 2 });
    const b = await call('?kind=reminder', 'Bearer shh');
    expect(await b.json()).toMatchObject({ kind: 'reminder', sent: 1 });
    expect(prep).toHaveBeenCalledTimes(1);
    expect(reminder).toHaveBeenCalledTimes(1);
  });

  it('rejects an unknown kind', async () => {
    expect((await call('?kind=other', 'Bearer shh')).status).toBe(400);
    expect((await call('', 'Bearer shh')).status).toBe(400);
  });

  it('answers 500 when a sender throws', async () => {
    prep.mockRejectedValueOnce(new Error('boom'));
    expect((await call('?kind=prep', 'Bearer shh')).status).toBe(500);
  });
});
