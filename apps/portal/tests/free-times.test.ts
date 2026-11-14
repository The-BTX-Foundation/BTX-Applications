import { describe, expect, it, vi } from 'vitest';
import type { Mail, MailClaim, MailLog, SendResult } from '@btx/emails';
import { freeRangeLine, freeRangeLines, freeTimesAlertHtml, freeTimesAlertSubject, freeTimesAlertText, headerSafe, oldAnswerLine, sentLabel, slotFitsRanges } from '@btx/emails';
import type { PushItem } from '@btx/push';
import { cleanSentRanges, MAX_SAID, sendFreeRanges } from '../../../packages/data/src/journey';
import type { BtxClient } from '../../../packages/data/src/client';
import { readBookingClosed, readStaffIds, saveAndNotify, type FreeTimesDeps, type ServiceDb } from '@/lib/free-times-notify';

type Send = (mail: Mail, from?: string) => Promise<SendResult>;

describe('free-time ranges as Eastern lines', () => {
  it('one AM/PM when both ends share it', () => {
    expect(freeRangeLine({ day: '2026-11-15', start: '15:00', end: '22:00' })).toBe('Sun Nov 15, 3:00 to 10:00 PM');
  });
  it('both halves when they differ, and midnight at the end', () => {
    expect(freeRangeLine({ day: '2026-11-14', start: '11:00', end: '14:00' })).toBe('Sat Nov 14, 11:00 AM to 2:00 PM');
    expect(freeRangeLine({ day: '2026-11-13', start: '18:30', end: '24:00' })).toBe('Fri Nov 13, 6:30 PM to midnight');
  });
  it('leaves out unusable ranges and sorts the rest by day and start', () => {
    const lines = freeRangeLines([
      { day: '2026-11-16', start: '17:00', end: '18:00' },
      { day: '2026-11-15', start: '15:00', end: '22:00' },
      { day: '2026-11-15', start: '20:00', end: '19:00' },
      { day: '2026-02-30', start: '10:00', end: '11:00' },
      'junk',
    ]);
    expect(lines).toEqual(['Sun Nov 15, 3:00 to 10:00 PM', 'Mon Nov 16, 5:00 to 6:00 PM']);
  });
  it('reads an older days-and-parts answer', () => {
    expect(oldAnswerLine(['Mon', 'Wed'], ['evening'])).toBe('Mon, Wed · evening');
    expect(oldAnswerLine([], null)).toBe('');
  });
  it('says when she sent it in Eastern time', () => {
    expect(sentLabel('2026-11-11T02:14:00Z')).toBe('Tue Nov 10, 9:14 PM');
  });
});

describe('which times fit her ranges', () => {
  const ranges = [{ day: '2026-11-16', start: '17:00', end: '18:00' }];
  it('fits a time fully inside a range (Eastern), touching both ends', () => {
    expect(slotFitsRanges('2026-11-16T22:00:00Z', '2026-11-16T22:30:00Z', ranges)).toBe(true);
    expect(slotFitsRanges('2026-11-16T22:30:00Z', '2026-11-16T23:00:00Z', ranges)).toBe(true);
  });
  it('does not fit a time that runs past the end, starts before, or is on another day', () => {
    expect(slotFitsRanges('2026-11-16T22:45:00Z', '2026-11-16T23:15:00Z', ranges)).toBe(false);
    expect(slotFitsRanges('2026-11-16T21:45:00Z', '2026-11-16T22:15:00Z', ranges)).toBe(false);
    expect(slotFitsRanges('2026-11-17T22:00:00Z', '2026-11-17T22:30:00Z', ranges)).toBe(false);
  });
});

describe('the alert email to info@', () => {
  const input = {
    name: 'Ada Okafor',
    code: 'APP-2026-00011',
    said: 'Sunday afternoon <or> Monday after 5',
    ranges: [{ day: '2026-11-15', start: '15:00', end: '22:00' }],
    interviewsUrl: 'https://ops.thebtxfoundation.org/scholarships/interviews#iz-oth',
    sentAt: '2026-11-11T02:14:00Z',
  };
  it('names her in the subject and lists her ranges and the link', () => {
    expect(freeTimesAlertSubject(input)).toBe('Ada Okafor asked for other interview times');
    const text = freeTimesAlertText(input);
    expect(text).toContain('Ada Okafor (APP-2026-00011) hasn\'t booked an interview and says none of the open times work.');
    expect(text).toContain('- Sun Nov 15, 3:00 to 10:00 PM');
    expect(text).toContain('https://ops.thebtxfoundation.org/scholarships/interviews#iz-oth');
    expect(text).toContain('Sent from the BTX Portal Tue Nov 10, 9:14 PM.');
  });
  it('never names the video platform, and escapes what she typed in the HTML', () => {
    const html = freeTimesAlertHtml(input);
    expect(html).toContain('&lt;or&gt;');
    expect(`${freeTimesAlertText(input)} ${html}`).not.toMatch(/teams|zoom|meet/i);
  });
});

// A stand-in for interview_free_times as the student's session sees it: `existing` is her row (or null); `updated` is how
// many rows the update returns (0 = RLS refused it); `error` fails every write.
function freeTimesClient(existing: unknown, updated = 1, error: { code: string } | null = null) {
  const log: string[] = [];
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => (log.push('read'), { data: existing, error: null }) }) }),
      insert: async () => (log.push('insert'), { error }),
      update: () => ({ eq: () => ({ select: async () => (log.push('update'), { data: error ? null : Array.from({ length: updated }, () => ({ application_id: 'a1' })), error }) }) }),
    }),
  } as unknown as BtxClient;
  return { client, log };
}

describe('sendFreeRanges (the save as the student)', () => {
  const row = { ranges: [{ day: '2026-11-15', start: '15:00', end: '22:00' }], said: ' after labs ' };
  it('adds her row the first time', async () => {
    const c = freeTimesClient(null);
    expect(await sendFreeRanges(c.client, 'a1', row)).toEqual({ ok: true, created: true });
    expect(c.log).toEqual(['read', 'insert']);
  });
  it('changes her row when one row comes back', async () => {
    expect(await sendFreeRanges(freeTimesClient({ application_id: 'a1' }).client, 'a1', row)).toEqual({ ok: true, created: false });
  });
  it('treats an update that changed no row as a refusal (RLS reports no error)', async () => {
    expect(await sendFreeRanges(freeTimesClient({ application_id: 'a1' }, 0).client, 'a1', row)).toEqual({ ok: false, code: '42501' });
  });
  it('passes on the database code of a refused insert, and needs a range', async () => {
    expect(await sendFreeRanges(freeTimesClient(null, 1, { code: '42501' }).client, 'a1', row)).toEqual({ ok: false, code: '42501' });
    expect(await sendFreeRanges(freeTimesClient(null).client, 'a1', { ranges: [], said: 'x' })).toEqual({ ok: false, code: 'no_ranges' });
  });
});

function fakeLog() {
  const rows = new Map<string, MailClaim>();
  const key = (r: MailClaim) => `${r.kind}|${r.application_id}|${r.slot_id}|${r.recipient.toLowerCase()}`;
  let n = 0;
  const log: MailLog = {
    claim: async (r) => ([...rows.values()].some((x) => key(x) === key(r)) ? false : (rows.set(`c${n}`, r), `c${n++}`)),
    setResendId: async () => {},
    release: async (id) => void rows.delete(id),
  };
  return { log, rows };
}

const NOW = new Date('2026-11-11T02:14:00Z');
const ROW = { ranges: [{ day: '2026-11-15', start: '15:00', end: '22:00' }], said: 'Sunday afternoon' };

// Stand-in deps. `alertedSince` = the time of the last alert already logged (null = none).
function setup(o: { save?: FreeTimesDeps['save']; closed?: boolean | null; alertedAt?: string | null; pushFails?: boolean; sendFails?: boolean } = {}) {
  const { log, rows } = fakeLog();
  const send = vi.fn<Send>(async () => (o.sendFails ? { sent: false, reason: 'network' } : { sent: true, id: 'r1' }));
  const pushed: PushItem[][] = [];
  const later: (() => Promise<void>)[] = [];
  const d: FreeTimesDeps = {
    save: o.save ?? (async () => ({ ok: true, created: true })),
    closed: async () => o.closed ?? false,
    now: () => NOW,
    later: (work) => void later.push(work),
    notify: {
      application: async () => ({ name: 'Ada Okafor', code: 'APP-2026-00011', cycleId: 'c1' }),
      recentAlert: async (since) => o.alertedAt != null && o.alertedAt >= since,
      staffIds: async () => ['u-admin', 'u-board'],
      push: async (items) => {
        if (o.pushFails) throw new Error('apns down');
        pushed.push(items);
      },
      log,
      send,
      from: 'portal@example.org',
      opsUrl: 'https://ops.example.org/',
    },
  };
  const flush = async () => {
    for (const w of later.splice(0)) await w();
  };
  return { d, send, pushed, rows, flush };
}

describe('saveAndNotify (the route)', () => {
  it('saves, answers, then pushes to the board and emails info@ once', async () => {
    const s = setup();
    expect(await saveAndNotify('a1', ROW, s.d)).toEqual({ ok: true });
    expect(s.send).not.toHaveBeenCalled(); // nothing before the answer has gone back
    await s.flush();
    expect(s.send).toHaveBeenCalledTimes(1);
    const mail = s.send.mock.calls[0][0];
    expect(mail.to).toBe('info@thebtxfoundation.org');
    expect(mail.subject).toBe('Ada Okafor asked for other interview times');
    expect(mail.text).toContain('https://ops.example.org/scholarships/interviews#iz-oth');
    expect([...s.rows.values()]).toEqual([{ kind: 'free-times', cycle_id: 'c1', application_id: 'a1', slot_id: null, recipient: 'info@thebtxfoundation.org|2026-11-10', to_address: 'info@thebtxfoundation.org' }]);
    expect(s.pushed).toHaveLength(1);
    expect(s.pushed[0].map((p) => p.userId)).toEqual(['u-admin', 'u-board']);
    // lock screens: the applicant number, never her name
    expect(JSON.stringify(s.pushed[0])).not.toContain('Ada');
    expect(s.pushed[0][0].title).toBe('Asked for other times');
  });
  it('a second save the same day emails nothing more (the per-day reservation)', async () => {
    const s = setup();
    await saveAndNotify('a1', ROW, s.d);
    await saveAndNotify('a1', ROW, s.d);
    await s.flush();
    expect(s.send).toHaveBeenCalledTimes(1);
  });
  it('an update within 24 hours of the last alert sends nothing; after 24 hours it alerts again', async () => {
    const recent = setup({ alertedAt: '2026-11-10T03:00:00Z' }); // 23 hours before NOW
    await saveAndNotify('a1', ROW, recent.d);
    await recent.flush();
    expect(recent.send).not.toHaveBeenCalled();
    expect(recent.pushed).toHaveLength(0);
    const old = setup({ alertedAt: '2026-11-10T02:00:00Z' }); // 24 hours 14 minutes before
    await saveAndNotify('a1', ROW, old.d);
    await old.flush();
    expect(old.send).toHaveBeenCalledTimes(1);
  });
  it('a failed push or email never changes the answer, and the email still goes when the push fails', async () => {
    const s = setup({ pushFails: true });
    expect(await saveAndNotify('a1', ROW, s.d)).toEqual({ ok: true });
    await expect(s.flush()).resolves.toBeUndefined();
    expect(s.send).toHaveBeenCalledTimes(1);
    const e = setup({ sendFails: true });
    expect(await saveAndNotify('a1', ROW, e.d)).toEqual({ ok: true });
    await expect(e.flush()).resolves.toBeUndefined();
    expect(e.rows.size).toBe(0); // the reservation is released, so a later save can try again
  });
  it('a throwing notify step (application read) is swallowed', async () => {
    const s = setup();
    s.d.notify!.application = async () => {
      throw new Error('db down');
    };
    expect(await saveAndNotify('a1', ROW, s.d)).toEqual({ ok: true });
    await expect(s.flush()).resolves.toBeUndefined();
  });
  it('a refusal after the deadline answers booking_closed and alerts nobody', async () => {
    const s = setup({ save: async () => ({ ok: false, code: '42501' }), closed: true });
    expect(await saveAndNotify('a1', ROW, s.d)).toEqual({ ok: false, kind: 'booking_closed' });
    await s.flush();
    expect(s.send).not.toHaveBeenCalled();
    expect(s.pushed).toHaveLength(0);
  });
  it('a refusal before the deadline is refused; any other failure is failed', async () => {
    expect(await saveAndNotify('a1', ROW, setup({ save: async () => ({ ok: false, code: '42501' }), closed: false }).d)).toEqual({ ok: false, kind: 'refused' });
    expect(await saveAndNotify('a1', ROW, setup({ save: async () => ({ ok: false, code: null }) }).d)).toEqual({ ok: false, kind: 'failed' });
    expect(await saveAndNotify('a1', ROW, setup({ save: async () => { throw new Error('x'); } }).d)).toEqual({ ok: false, kind: 'failed' });
  });
  it('with no service key (notify null) it only saves', async () => {
    const s = setup();
    s.d.notify = null;
    expect(await saveAndNotify('a1', ROW, s.d)).toEqual({ ok: true });
  });
});

// A service-role stand-in: tables answer with fixed rows; getUserById answers with a role per id.
function serviceDb(tables: Record<string, unknown>, roles: Record<string, string> = {}): ServiceDb {
  const chain = (data: unknown) => {
    const q: Record<string, unknown> = {};
    for (const k of ['select', 'eq', 'gte', 'limit']) q[k] = () => q;
    q.maybeSingle = async () => ({ data, error: null });
    q.then = (r: (v: unknown) => void) => r({ data, error: null });
    return q;
  };
  return {
    from: (t: string) => chain(tables[t]),
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { app_metadata: { role: roles[id] } } } }) } },
  };
}

describe('service-role reads', () => {
  it('staff ids are the staff_profiles people whose role is admin or board', async () => {
    const db = serviceDb({ staff_profiles: [{ user_id: 'u1' }, { user_id: 'u2' }, { user_id: 'u3' }] }, { u1: 'admin', u2: 'board', u3: 'applicant' });
    expect(await readStaffIds(db)).toEqual(['u1', 'u2']);
  });
  it('booking is closed when the cycle deadline has passed, open when none is set', async () => {
    const closed = serviceDb({ applications: { cycle_id: 'c1' }, cycles: { booking_closes_at: '2026-11-10T00:00:00Z' } });
    expect(await readBookingClosed(closed, 'a1', NOW)).toBe(true);
    const open = serviceDb({ applications: { cycle_id: 'c1' }, cycles: { booking_closes_at: null } });
    expect(await readBookingClosed(open, 'a1', NOW)).toBe(false);
  });
});

describe('a name that tries to add a mail header', () => {
  it('turns control characters into spaces, so the subject stays one line', () => {
    const subject = freeTimesAlertSubject({ name: 'A\r\nBcc: x@y', code: 'APP-1', said: '', ranges: [], interviewsUrl: 'https://x', sentAt: '2026-11-11T02:14:00Z' });
    expect(subject).toBe('A Bcc: x@y asked for other interview times');
    expect(subject).not.toMatch(/[\r\n\t]/);
  });
  it('cuts the name at 80 characters and collapses tabs and runs of spaces', () => {
    expect(headerSafe(`${'x'.repeat(100)}`)).toHaveLength(80);
    expect(headerSafe(' Ada \t\t Okafor ')).toBe('Ada Okafor');
  });
});

describe('cleanSentRanges and the 60-range limit', () => {
  it('keeps only real days and HH:MM times with the end after the start (24:00 allowed), each once', () => {
    expect(
      cleanSentRanges([
        { day: '2026-11-15', start: '15:00', end: '22:00' },
        { day: '2026-11-15', start: '15:00', end: '22:00' },
        { day: '2026-11-15', start: '18:00', end: '24:00' },
        { day: '2026-11-15', start: '18:00', end: '24:30' },
        { day: '2026-11-15', start: '9:00', end: '10:00' },
        { day: '2026-11-15', start: '12:00', end: '11:00' },
        { day: '2026-13-01', start: '10:00', end: '11:00' },
        { day: '2026-11-15x', start: '10:00', end: '11:00' },
        { day: '2026-11-15', start: '10:00', end: 11 },
        null,
      ]),
    ).toEqual([
      { day: '2026-11-15', start: '15:00', end: '22:00' },
      { day: '2026-11-15', start: '18:00', end: '24:00' },
    ]);
  });
  it('refuses more than 60 ranges after cleaning (never cuts), and cuts what she typed to 1000 characters', async () => {
    const many = Array.from({ length: 61 }, (_, i) => ({ day: `2026-11-${String((i % 28) + 1).padStart(2, '0')}`, start: `${String(Math.floor(i / 28) + 8).padStart(2, '0')}:00`, end: '23:00' }));
    expect(cleanSentRanges(many)).toHaveLength(61);
    expect(await sendFreeRanges(freeTimesClient(null).client, 'a1', { ranges: many, said: '' })).toEqual({ ok: false, code: 'too_many' });
    let inserted: { said: string } | null = null;
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        insert: async (row: { said: string }) => ((inserted = row), { error: null }),
      }),
    } as unknown as BtxClient;
    await sendFreeRanges(client, 'a1', { ranges: many.slice(0, 2), said: 'y'.repeat(1500) });
    expect(inserted!.said).toHaveLength(MAX_SAID);
  });
});
