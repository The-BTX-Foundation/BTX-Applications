import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prep, reminder, prepPush, duePush } = vi.hoisted(() => ({
  prepPush: vi.fn<(now?: Date) => Promise<Record<string, unknown> | null>>(async () => ({ configured: true, delivered: 3, skipped: 0, retry: 0, noDevice: 0, retired: 0, failed: 0 })),
  duePush: vi.fn<(now?: Date) => Promise<Record<string, unknown> | null>>(async () => ({ configured: true, delivered: 1, skipped: 0, retry: 0, noDevice: 0, retired: 0, failed: 0 })),
  prep: vi.fn(async () => ({ ok: true, kind: 'prep', sent: 2, skipped: 0, failed: 0, notConfigured: false, at: 'x' })),
  reminder: vi.fn(async () => ({ ok: true, kind: 'reminder', sent: 1, skipped: 0, failed: 0, notConfigured: false, at: 'x' })),
}));
vi.mock('@/lib/email/interviews', () => ({ sendPrepEmails: prep, sendReminderEmails: reminder }));
vi.mock('@/lib/push/crons', () => ({ sendPrepPushes: prepPush, sendDueTomorrowPushes: duePush }));

import { GET } from '@/app/api/cron/interview-emails/route';

const call = (qs: string, auth?: string) => GET(new Request(`https://ops.example.org/api/cron/interview-emails${qs}`, { headers: auth ? { authorization: auth } : {} }));

describe('GET /api/cron/interview-emails', () => {
  beforeEach(() => {
    prep.mockClear();
    reminder.mockClear();
    prepPush.mockClear();
    duePush.mockClear();
    vi.stubEnv('CRON_SECRET', 'shh');
  });

  it('refuses without the bearer secret, with the wrong one, or when no secret is set', async () => {
    expect((await call('?kind=prep')).status).toBe(401);
    expect((await call('?kind=prep', 'Bearer nope')).status).toBe(401);
    vi.stubEnv('CRON_SECRET', '');
    expect((await call('?kind=prep', 'Bearer ')).status).toBe(401);
    expect(prep).not.toHaveBeenCalled();
    expect(prepPush).not.toHaveBeenCalled();
    expect(duePush).not.toHaveBeenCalled();
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

  it('prep also sends the "Interviews tomorrow" pushes and reminder the "Due tomorrow" pushes, and reports them', async () => {
    const a = await (await call('?kind=prep', 'Bearer shh')).json();
    expect(a.push).toMatchObject({ delivered: 3 });
    expect(prepPush).toHaveBeenCalledTimes(1);
    expect(duePush).not.toHaveBeenCalled();
    const b = await (await call('?kind=reminder', 'Bearer shh')).json();
    expect(b.push).toMatchObject({ delivered: 1 });
    expect(duePush).toHaveBeenCalledTimes(1);
  });

  it('a push that throws never fails the emails', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    prepPush.mockRejectedValueOnce(new Error('apns'));
    const res = await call('?kind=prep', 'Bearer shh');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, sent: 2, push: null });
    quiet.mockRestore();
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
