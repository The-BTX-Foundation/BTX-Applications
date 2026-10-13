import { describe, expect, it, vi } from 'vitest';
import type { InterviewRow, Mail, MailClaim, MailLog, SendResult } from '@btx/emails';
import { sendAvailabilityReminders, sendPrepEmails, sendRebalanceEmails, sendReminderEmails, sendVideoLinkEmails, tomorrowEastern, type InterviewDeps, type InterviewMailData } from '@/lib/email/interviews';

type Send = (mail: Mail, from?: string) => Promise<SendResult>;

// A log with the same "never twice" key as the database's unique index.
function fakeLog() {
  const rows = new Map<string, MailClaim>();
  const key = (r: MailClaim) => `${r.kind}|${r.application_id ?? ''}|${r.slot_id ?? ''}|${r.recipient.toLowerCase()}`;
  let n = 0;
  const log: MailLog = {
    claim: async (r) => {
      if ([...rows.values()].some((x) => key(x) === key(r))) return false;
      const id = `c${n++}`;
      rows.set(id, r);
      return id;
    },
    setResendId: async () => {},
    release: async (id) => void rows.delete(id),
  };
  return { log, rows };
}

const kelsey = { userId: 'u1', name: 'Kelsey Davis', email: 'kdavis@btx.org' };
const tomi = { userId: 'u2', name: 'Tomi Falodun', email: 'tfalodun@btx.org' };
const row = (over: Partial<InterviewRow> = {}): InterviewRow => ({
  slotId: 's1', cycleId: 'c1', startsAt: '2026-11-11T23:00:00Z', endsAt: '2026-11-11T23:30:00Z', videoUrl: 'https://meet.google.com/aaa', applicationId: 'a1',
  applicantName: 'Ada Okafor', applicantEmail: 'ada@terpmail.umd.edu', code: 'APP-2026-00015', answers: ['One', 'Two', 'Three'], interviewers: [kelsey, tomi], ...over,
});

function fakeData(rows: InterviewRow[], board: Awaited<ReturnType<InterviewMailData['boardMembers']>> = [], closes: string | null = null) {
  const asked: unknown[] = [];
  const data: InterviewMailData = {
    interviews: async (q) => {
      asked.push(q);
      if ('slotIds' in q) return rows.filter((r) => q.slotIds.includes(r.slotId));
      return rows.filter((r) => r.startsAt >= q.from && r.startsAt < q.to); // the real query window
    },
    cycleInfo: async () => ({ term: 'Fall 2026', award: 'Legacy Scholarship' }),
    questions: async () => [{ title: 'Community', questions: ['Q1'] }, { title: 'To close', questions: ['Q2'] }],
    userEmail: async (id) => (id === 'u9' ? 'old@btx.org' : null),
    boardMembers: async () => board,
    cycleCloses: async () => closes,
  };
  return { data, asked };
}

const okSend = () => vi.fn<Send>(async () => ({ sent: true, id: 'rs_1' }));
const deps = (data: InterviewMailData, log: MailLog, send = okSend(), extra: InterviewDeps = {}): InterviewDeps => ({
  data, log, send, isAdmin: async () => true, pauseMs: 0, portalUrl: 'https://apply.example.org', opsUrl: 'https://ops.example.org', from: 'ops@example.org', ...extra,
});

describe('tomorrowEastern', () => {
  it('is the next Eastern calendar day, including across daylight-saving changes', () => {
    expect(tomorrowEastern(new Date('2026-11-10T23:00:00Z'))).toBe('2026-11-11'); // 6 PM EST
    expect(tomorrowEastern(new Date('2026-11-11T03:00:00Z'))).toBe('2026-11-11'); // 10 PM EST Nov 10
    expect(tomorrowEastern(new Date('2026-10-31T22:00:00Z'))).toBe('2026-11-01'); // the day before the fall-back day
    expect(tomorrowEastern(new Date('2026-11-01T22:00:00Z'))).toBe('2026-11-02'); // the day after it
    expect(tomorrowEastern(new Date('2026-03-07T23:00:00Z'))).toBe('2026-03-08'); // before spring-forward
    expect(tomorrowEastern(new Date('2026-03-08T15:00:00Z'))).toBe('2026-03-09');
    expect(tomorrowEastern(new Date('2026-12-31T20:00:00Z'))).toBe('2027-01-01');
  });
});

describe('sendPrepEmails', () => {
  const now = new Date('2026-11-10T23:00:00Z'); // 6 PM EST, Tue Nov 10
  it('sends one prep email to each interviewer of tomorrow\'s paired interviews, with the invite', async () => {
    const tomorrow = row(); // Wed Nov 11, 6 PM EST
    const today = row({ slotId: 's2', applicationId: 'a2', startsAt: '2026-11-10T23:30:00Z' });
    const later = row({ slotId: 's3', applicationId: 'a3', startsAt: '2026-11-12T23:00:00Z' });
    const unpaired = row({ slotId: 's4', applicationId: 'a4', startsAt: '2026-11-11T20:00:00Z', interviewers: [] });
    const { data } = fakeData([tomorrow, today, later, unpaired]);
    const { log, rows } = fakeLog();
    const send = okSend();
    const r = await sendPrepEmails(now, deps(data, log, send));
    expect(r).toMatchObject({ ok: true, kind: 'prep', sent: 2, skipped: 0, failed: 0, notConfigured: false });
    const mails = send.mock.calls.map((c) => c[0]);
    expect(mails.map((m) => m.to).sort()).toEqual(['kdavis@btx.org', 'tfalodun@btx.org']);
    expect(mails[0].subject).toBe('Your BTX interview tomorrow: Ada Okafor, APP-2026-00015 at 6:00 PM');
    expect(mails[0].html).toContain('https://ops.example.org/scholarships/scoring');
    expect(mails[0].html).toContain('Q1');
    expect(mails[0].attachments?.[0].filename).toBe('btx-interview.ics');
    expect(Buffer.from(mails[0].attachments![0].content, 'base64').toString()).toContain('UID:interview-a1@thebtxfoundation.org');
    expect([...rows.values()].map((x) => x.kind)).toEqual(['prep', 'prep']);
  });

  it('never twice: a second run sends nothing', async () => {
    const { data } = fakeData([row()]);
    const { log } = fakeLog();
    const send = okSend();
    await sendPrepEmails(now, deps(data, log, send));
    const again = await sendPrepEmails(now, deps(data, log, send));
    expect(again).toMatchObject({ ok: true, sent: 0, skipped: 2 });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('gives the reservation back when a send fails, so a retry sends it', async () => {
    const { data } = fakeData([row()]);
    const { log, rows } = fakeLog();
    const bad = vi.fn<Send>(async () => ({ sent: false, reason: 'resend-500' }));
    expect(await sendPrepEmails(now, deps(data, log, bad))).toMatchObject({ sent: 0, failed: 2 });
    expect(rows.size).toBe(0);
    expect(await sendPrepEmails(now, deps(data, log))).toMatchObject({ sent: 2, failed: 0 });
  });

  it('reports "not configured" and logs nothing when nothing can be sent', async () => {
    const { data } = fakeData([row()]);
    const { log, rows } = fakeLog();
    const none = vi.fn<Send>(async () => ({ sent: false, reason: 'not-configured' }));
    expect(await sendPrepEmails(now, deps(data, log, none))).toMatchObject({ ok: true, sent: 0, failed: 0, notConfigured: true });
    expect(rows.size).toBe(0);
  });

  it('needs the Ops Hub address for the scorecard link', async () => {
    const { data } = fakeData([row()]);
    const { log } = fakeLog();
    vi.stubEnv('OPS_HUB_URL', '');
    expect(await sendPrepEmails(now, deps(data, log, okSend(), { opsUrl: '' }))).toEqual({ ok: false, reason: 'no-ops-url' });
    vi.unstubAllEnvs();
  });

  it('picks the right day when tomorrow is the 25-hour fall-back day', async () => {
    // Sun Nov 1 2026: clocks go back at 2 AM. Interview Sun Nov 1, 7 PM EST = 00:00Z Nov 2.
    const sunday = row({ startsAt: '2026-11-02T00:00:00Z', endsAt: '2026-11-02T00:30:00Z' });
    const monday = row({ slotId: 's9', applicationId: 'a9', startsAt: '2026-11-02T14:00:00Z' }); // Mon 9 AM EST: not tomorrow
    const { data } = fakeData([sunday, monday]);
    const { log } = fakeLog();
    const send = okSend();
    const r = await sendPrepEmails(new Date('2026-10-31T22:00:00Z'), deps(data, log, send)); // Sat Oct 31, 6 PM EDT
    expect(r).toMatchObject({ sent: 2 });
    expect(send.mock.calls.every((c) => c[0].subject.includes('Ada Okafor'))).toBe(true);
    expect(send.mock.calls[0][0].html).toContain('Sun Nov 1');
  });
});

describe('sendReminderEmails', () => {
  const now = new Date('2026-11-10T14:00:00Z'); // 9 AM EST Tue Nov 10
  it('sends the student her reminder for tomorrow, with the interviewer names and the change link', async () => {
    const { data } = fakeData([row()]);
    const { log } = fakeLog();
    const send = okSend();
    const r = await sendReminderEmails(now, deps(data, log, send));
    expect(r).toMatchObject({ ok: true, kind: 'reminder', sent: 1 });
    const m = send.mock.calls[0][0];
    expect(m.to).toBe('ada@terpmail.umd.edu');
    expect(m.html).toContain('Kelsey Davis and Tomi Falodun will interview you.');
    expect(m.html).toContain('https://apply.example.org/status/change');
    expect(await sendReminderEmails(now, deps(data, log, send))).toMatchObject({ sent: 0, skipped: 1 });
  });
  it('still reminds a student whose interviewers are not set yet', async () => {
    const { data } = fakeData([row({ interviewers: [] })]);
    const { log } = fakeLog();
    expect(await sendReminderEmails(now, deps(data, log))).toMatchObject({ sent: 1 });
  });
});

describe('sendRebalanceEmails', () => {
  it('tells the interviewer added and the one removed, each once', async () => {
    const after = row({ interviewers: [kelsey, tomi] }); // u9 was replaced by Tomi (u2)
    const { data } = fakeData([after]);
    const { log } = fakeLog();
    const send = okSend();
    const moves = [{ slotId: 's1', from: 'u9', to: 'u2', fromName: 'Old Person' }];
    const r = await sendRebalanceEmails('c1', moves, deps(data, log, send));
    expect(r).toMatchObject({ ok: true, kind: 'rebalance', sent: 2 });
    const mails = send.mock.calls.map((c) => c[0]);
    expect(mails.find((m) => m.to === 'tfalodun@btx.org')!.subject).toContain("You're now interviewing Ada Okafor");
    const removed = mails.find((m) => m.to === 'old@btx.org')!;
    expect(removed.subject).toContain("You're no longer interviewing Ada Okafor");
    expect(Buffer.from(removed.attachments![0].content, 'base64').toString()).toContain('METHOD:CANCEL');
    expect(Buffer.from(removed.attachments![0].content, 'base64').toString()).toContain('UID:interview-a1@thebtxfoundation.org');
    const added = Buffer.from(mails.find((m) => m.to === 'tfalodun@btx.org')!.attachments![0].content, 'base64').toString();
    expect(added).toContain('METHOD:REQUEST');
    expect(added).toContain('UID:interview-a1@thebtxfoundation.org');
    expect(await sendRebalanceEmails('c1', moves, deps(data, log, send))).toMatchObject({ sent: 0, skipped: 2 });
  });
  it('is admin only', async () => {
    const { data } = fakeData([row()]);
    const { log } = fakeLog();
    const send = okSend();
    expect(await sendRebalanceEmails('c1', [], deps(data, log, send, { isAdmin: async () => false }))).toEqual({ ok: false, reason: 'not-admin' });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('sendVideoLinkEmails', () => {
  it('sends the student and both interviewers the link; the same link again sends nothing; a new link does', async () => {
    const rows = [row()];
    const { data } = fakeData(rows);
    const { log } = fakeLog();
    const send = okSend();
    expect(await sendVideoLinkEmails('c1', ['s1'], deps(data, log, send))).toMatchObject({ ok: true, kind: 'video-link', sent: 3 });
    expect(send.mock.calls.map((c) => c[0].to).sort()).toEqual(['ada@terpmail.umd.edu', 'kdavis@btx.org', 'tfalodun@btx.org']);
    expect(await sendVideoLinkEmails('c1', ['s1'], deps(data, log, send))).toMatchObject({ sent: 0, skipped: 3 });
    rows[0] = row({ videoUrl: 'https://zoom.us/j/2' });
    expect(await sendVideoLinkEmails('c1', ['s1'], deps(data, log, send))).toMatchObject({ sent: 3 });
  });
  it('skips slots with no link and is admin only', async () => {
    const { data } = fakeData([row({ videoUrl: null })]);
    const { log } = fakeLog();
    expect(await sendVideoLinkEmails('c1', ['s1'], deps(data, log))).toMatchObject({ sent: 0 });
    expect(await sendVideoLinkEmails('c1', ['s1'], deps(data, log, okSend(), { isAdmin: async () => false }))).toEqual({ ok: false, reason: 'not-admin' });
  });
});

describe('sendAvailabilityReminders', () => {
  const member = (userId: string, name: string, sentAt: string | null = null, email: string | null = `${name.split(' ')[0].toLowerCase()}@btx.org`) => ({ userId, name, email, sentAt });
  const board = [member('u0', 'Dania Morris'), member('u1', 'Kelsey Davis', '2026-11-02T15:00:00Z'), member('u2', 'Marcus Davis'), member('u3', 'Darien Strachan'), member('u4', 'No Address', null, null)];
  const closes = '2026-11-06T04:59:00Z'; // 11:59 PM Eastern on Thu Nov 5
  const as = (callerId: string, extra: InterviewDeps = {}) => ({ callerId: async () => callerId, now: () => new Date('2026-11-04T15:00:00Z'), ...extra });

  it('emails the board members with no availability sent, skipping the caller and anyone with no address', async () => {
    const { data } = fakeData([], board, closes);
    const { log, rows } = fakeLog();
    const send = okSend();
    const r = await sendAvailabilityReminders('c1', deps(data, log, send, as('u0')));
    expect(r).toMatchObject({ ok: true, kind: 'availability-reminder', sent: 2, skipped: 0, failed: 0, notConfigured: false, names: ['Marcus Davis', 'Darien Strachan'] });
    const mails = send.mock.calls.map((c) => c[0]);
    expect(mails.map((m) => m.to)).toEqual(['marcus@btx.org', 'darien@btx.org']); // not Dania (caller), Kelsey (sent) or the one with no address
    expect(mails[0].subject).toBe('Give your interview availability by Thu Nov 5');
    expect(mails[0].html).toContain('Hi Marcus.');
    expect(mails[0].html).toContain('https://ops.example.org/scholarships/interviews/availability');
    expect(mails[0].html).toContain('Give your availability');
    expect([...rows.values()].map((x) => [x.kind, x.application_id, x.slot_id, x.recipient])).toEqual([
      ['availability-reminder', null, null, 'marcus@btx.org|2026-11-04'],
      ['availability-reminder', null, null, 'darien@btx.org|2026-11-04'],
    ]);
  });

  it('sends nothing more the same Eastern day, and sends again the next day', async () => {
    const { data } = fakeData([], board, closes);
    const { log } = fakeLog();
    const send = okSend();
    await sendAvailabilityReminders('c1', deps(data, log, send, as('u0')));
    // 11:30 PM Eastern the same day (04:30Z the next UTC day)
    const late = await sendAvailabilityReminders('c1', deps(data, log, send, as('u0', { now: () => new Date('2026-11-05T04:30:00Z') })));
    expect(late).toMatchObject({ sent: 0, skipped: 2, names: [] });
    expect(send).toHaveBeenCalledTimes(2);
    const next = await sendAvailabilityReminders('c1', deps(data, log, send, as('u0', { now: () => new Date('2026-11-05T15:00:00Z') })));
    expect(next).toMatchObject({ sent: 2, skipped: 0 });
    expect(send).toHaveBeenCalledTimes(4);
  });

  it('gives a failed email back so the next press tries it again, and reports it', async () => {
    const { data } = fakeData([], board, closes);
    const { log } = fakeLog();
    const send = vi.fn<Send>().mockResolvedValueOnce({ sent: true, id: 'r1' }).mockResolvedValueOnce({ sent: false, reason: 'network' });
    const r = await sendAvailabilityReminders('c1', deps(data, log, send, as('u0')));
    expect(r).toMatchObject({ sent: 1, failed: 1, names: ['Marcus Davis'] });
    const again = await sendAvailabilityReminders('c1', deps(data, log, okSend(), as('u0')));
    expect(again).toMatchObject({ sent: 1, skipped: 1, names: ['Darien Strachan'] });
  });

  it('says not configured when there is no email service, and is admin only', async () => {
    const { data } = fakeData([], board, closes);
    const { log, rows } = fakeLog();
    const none = vi.fn<Send>(async () => ({ sent: false, reason: 'not-configured' }));
    expect(await sendAvailabilityReminders('c1', deps(data, log, none, as('u0')))).toMatchObject({ sent: 0, notConfigured: true });
    expect(rows.size).toBe(0);
    expect(await sendAvailabilityReminders('c1', deps(data, log, okSend(), as('u0', { isAdmin: async () => false })))).toEqual({ ok: false, reason: 'not-admin' });
    expect(await sendAvailabilityReminders('c1', deps(data, log, okSend(), as('u0', { opsUrl: '' })))).toEqual({ ok: false, reason: 'no-ops-url' });
  });

  it('has no date in the subject when the cycle has no close date', async () => {
    const { data } = fakeData([], board, null);
    const { log } = fakeLog();
    const send = okSend();
    await sendAvailabilityReminders('c1', deps(data, log, send, as('u0')));
    expect(send.mock.calls[0][0].subject).toBe('Give your interview availability');
  });
});
