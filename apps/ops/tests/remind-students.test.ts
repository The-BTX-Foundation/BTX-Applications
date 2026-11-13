// "Remind" for students who have not booked (lib/email/remind-students.ts) and the admins' "Needs cover" email
// (lib/email/needs-cover.ts): who gets one, the once-a-day / once-ever dedupe, and the admin-only check.
import { describe, expect, it } from 'vitest';
import type { MailClaim, MailLog } from '@btx/emails';
import { remindLine, remindUnbooked, type Applicant, type RemindRow, type RemindStore } from '@/lib/email/remind-students';
import { needsCoverMail, sendNeedsCoverEmails } from '@/lib/email/needs-cover';

const NOW = new Date('2026-11-13T15:00:00Z');
const app = (id: string, name: string): Applicant => ({ id, full_name: name, terpmail: `${id}@terpmail.umd.edu`, applicant_code: `BTX-${id}` });

// An in-memory email_log with the unique key the database has (kind + recipient).
function store(opts: { booked?: string[]; notReady?: boolean; published?: string | null; interviewEnd?: string | null } = {}) {
  const keys = new Set<string>();
  const sent: RemindRow[] = [];
  const s: RemindStore = {
    cycle: async () => ({ term: 'Fall 2026', award_name: 'Legacy', interview_end: opts.interviewEnd === undefined ? '2026-11-20' : opts.interviewEnd }),
    publishedCycleId: async () => (opts.published === undefined ? 'c1' : opts.published),
    submittedApplicants: async () => [app('a1', 'Ana Ruiz'), app('a2', 'Ben Cole'), app('a3', 'Cam Fox')],
    bookedApplicationIds: async () => new Set(opts.booked ?? []),
    claim: async (row) => {
      if (opts.notReady) return 'not-ready';
      const k = `${row.kind}|${row.recipient}`;
      if (keys.has(k)) return false;
      keys.add(k);
      sent.push(row);
      return k;
    },
    setResendId: async () => {},
    release: async (id) => {
      keys.delete(id);
    },
  };
  return { s, sent };
}
const okSend = async () => ({ sent: true as const, id: 'r1' });
const base = { isAdmin: async () => true, send: okSend, now: () => NOW, pauseMs: 0, from: 'ops@example.org' };

describe('remindUnbooked', () => {
  it('emails everyone without a booking, never the ones who booked', async () => {
    const { s, sent } = store({ booked: ['a2'] });
    const r = await remindUnbooked('c1', null, { ...base, store: s });
    expect(r).toMatchObject({ ok: true, sent: 2, skipped: 0, failed: 0 });
    expect(sent.map((x) => x.application_id)).toEqual(['a1', 'a3']);
    expect(sent[0]).toMatchObject({ kind: 'book-reminder', recipient: 'a1@terpmail.umd.edu|2026-11-13', slot_id: null });
  });
  it('one student by id', async () => {
    const { s, sent } = store();
    expect(await remindUnbooked('c1', ['a3'], { ...base, store: s })).toMatchObject({ ok: true, sent: 1 });
    expect(sent.map((x) => x.application_id)).toEqual(['a3']);
  });
  it('at most once per student per day: a second press sends nothing more', async () => {
    const { s } = store();
    await remindUnbooked('c1', ['a1'], { ...base, store: s });
    const again = await remindUnbooked('c1', null, { ...base, store: s });
    expect(again).toMatchObject({ ok: true, sent: 2, skipped: 1 });
    expect(remindLine(again).message).toBe('Reminded 2 students. 1 already had a reminder today.');
  });
  it('the next Eastern day is a new day', async () => {
    const { s } = store();
    await remindUnbooked('c1', ['a1'], { ...base, store: s });
    expect(await remindUnbooked('c1', ['a1'], { ...base, store: s, now: () => new Date('2026-11-14T15:00:00Z') })).toMatchObject({ sent: 1, skipped: 0 });
  });
  it('a failed send gives the day back', async () => {
    const { s } = store();
    const r = await remindUnbooked('c1', ['a1'], { ...base, store: s, send: async () => ({ sent: false as const, reason: 'network' as const }) });
    expect(r).toMatchObject({ ok: true, sent: 0, failed: 1 });
    expect(await remindUnbooked('c1', ['a1'], { ...base, store: s })).toMatchObject({ sent: 1 });
  });
  it('before the migration: nothing goes out and the page says why', async () => {
    const { s } = store({ notReady: true });
    const r = await remindUnbooked('c1', null, { ...base, store: s });
    expect(r).toEqual({ ok: false, reason: 'not-ready' });
    expect(remindLine(r)).toEqual({ ok: false, message: 'Reminders need a database update first. No emails went out.' });
  });
  it('permission: only admins', async () => {
    const { s, sent } = store();
    const r = await remindUnbooked('c1', null, { ...base, store: s, isAdmin: async () => false });
    expect(r).toEqual({ ok: false, reason: 'not-admin' });
    expect(sent).toEqual([]);
  });
  it('refuses a cycle that is not the current published one', async () => {
    const { s, sent } = store({ published: 'c2' });
    const r = await remindUnbooked('c1', null, { ...base, store: s });
    expect(r).toEqual({ ok: false, reason: 'not-current' });
    expect(remindLine(r).message).toBe('Reminders go only for the open cycle. No emails went out.');
    expect(sent).toEqual([]);
    expect(await remindUnbooked('c1', null, { ...base, store: store({ published: null }).s })).toEqual({ ok: false, reason: 'not-current' });
  });
  it('refuses once the interview end date has passed (Eastern), and still sends on the last day', async () => {
    const { s, sent } = store({ interviewEnd: '2026-11-12' });
    const r = await remindUnbooked('c1', null, { ...base, store: s });
    expect(r).toEqual({ ok: false, reason: 'interviews-over' });
    expect(remindLine(r).message).toBe('The interview dates have passed. No emails went out.');
    expect(sent).toEqual([]);
    // 10 PM Eastern on Nov 13 is 03:00 UTC on Nov 14: still the last interview day.
    const last = store({ interviewEnd: '2026-11-13' });
    expect(await remindUnbooked('c1', ['a1'], { ...base, store: last.s, now: () => new Date('2026-11-14T03:00:00Z') })).toMatchObject({ ok: true, sent: 1 });
    // 12:30 AM Eastern on Nov 14: over.
    expect(await remindUnbooked('c1', ['a1'], { ...base, store: store({ interviewEnd: '2026-11-13' }).s, now: () => new Date('2026-11-14T05:30:00Z') })).toEqual({ ok: false, reason: 'interviews-over' });
  });
  it('no interview end date: refused', async () => {
    expect(await remindUnbooked('c1', null, { ...base, store: store({ interviewEnd: null }).s })).toEqual({ ok: false, reason: 'no-interview-end' });
  });
  it('everyone booked: nothing to send', async () => {
    const { s } = store({ booked: ['a1', 'a2', 'a3'] });
    expect(await remindUnbooked('c1', null, { ...base, store: s })).toEqual({ ok: false, reason: 'none' });
  });
});

describe('sendNeedsCoverEmails', () => {
  const item = { slotId: 's1', cycleId: 'c1', outgoingId: 'm1', applicant: 'Ana Ruiz', code: 'BTX-1', when: 'Fri Nov 20, 5:30 PM' };
  const admins = async () => [
    { name: 'Kelsey Admin', email: 'K@example.org' },
    { name: 'Dom Admin', email: 'd@example.org' },
  ];
  function log() {
    const keys = new Set<string>();
    const claims: MailClaim[] = [];
    const l: MailLog = {
      claim: async (row) => {
        const k = `${row.kind}|${row.slot_id}|${row.recipient}`;
        if (keys.has(k)) return false;
        keys.add(k);
        claims.push(row);
        return k;
      },
      setResendId: async () => {},
      release: async (id) => {
        keys.delete(id);
      },
    };
    return { l, claims };
  }
  it('emails each admin once per interview for the same member and day', async () => {
    const { l, claims } = log();
    const deps = { admins, log: l, send: okSend, from: 'ops@example.org', opsUrl: 'https://ops.example.org/', now: () => NOW };
    expect(await sendNeedsCoverEmails([item], 'Ada Lee', deps)).toEqual({ sent: 2, skipped: 0, failed: 0, notConfigured: false });
    expect(await sendNeedsCoverEmails([item], 'Ada Lee', deps)).toMatchObject({ sent: 0, skipped: 2 });
    expect(claims.map((c) => [c.kind, c.recipient, c.application_id])).toEqual([
      ['rebalance', 'k@example.org|needs-cover|m1|2026-11-13', null],
      ['rebalance', 'd@example.org|needs-cover|m1|2026-11-13', null],
    ]);
  });
  it('a new needs-cover event alerts the admins again: another member, or another day', async () => {
    const { l } = log();
    const deps = { admins, log: l, send: okSend, from: 'ops@example.org', now: () => NOW };
    await sendNeedsCoverEmails([item], 'Ada Lee', deps);
    expect(await sendNeedsCoverEmails([{ ...item, outgoingId: 'm2' }], 'Bo Kim', deps)).toMatchObject({ sent: 2, skipped: 0 });
    expect(await sendNeedsCoverEmails([item], 'Ada Lee', { ...deps, now: () => new Date('2026-11-14T15:00:00Z') })).toMatchObject({ sent: 2, skipped: 0 });
  });
  it('an interview starting soon says it was not moved automatically', () => {
    const m = needsCoverMail({ name: 'Kelsey Admin', email: 'k@example.org' }, { ...item, soon: true }, 'Ada Lee', '');
    expect(m.text).toContain('It starts within 48 hours, so it was not moved automatically.');
    expect(m.text).not.toContain('nobody else is free');
  });
  it('nothing to send for no interviews', async () => {
    expect(await sendNeedsCoverEmails([], 'Ada Lee', { admins, log: log().l, send: okSend })).toMatchObject({ sent: 0 });
  });
  it('the email names the student, the time and the member, and links to the interview', () => {
    const m = needsCoverMail({ name: 'Kelsey Admin', email: 'k@example.org' }, item, 'Ada Lee', 'https://ops.example.org');
    expect(m.subject).toBe('Needs cover: Ana Ruiz, Fri Nov 20, 5:30 PM');
    expect(m.text).toContain('Hi Kelsey,');
    expect(m.text).toContain('Ada Lee stays on it until you change the interviewer.');
    expect(m.text).toContain('https://ops.example.org/scholarships/interviews/s1');
  });
});
