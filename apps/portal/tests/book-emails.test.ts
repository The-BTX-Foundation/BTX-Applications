import { describe, expect, it, vi } from 'vitest';
import type { InterviewRow, Mail, MailClaim, MailLog, SendResult } from '@btx/emails';
import type { BookResult } from '@btx/data';
import { bookAndNotify, type BookEmailDeps } from '@/lib/book-emails';

type Send = (mail: Mail, from?: string) => Promise<SendResult>;

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

const person = (id: string, name: string, email: string) => ({ userId: id, name, email });
const slot = (slotId: string, startsAt: string, ivs = [person('u1', 'Kelsey Davis', 'k@btx.org'), person('u2', 'Tomi Falodun', 't@btx.org')]): InterviewRow => ({
  slotId, cycleId: 'c1', startsAt, endsAt: startsAt.replace(':00:00Z', ':30:00Z'), videoUrl: null, applicationId: 'a1', applicantName: 'Ada Okafor', applicantEmail: 'ada@terpmail.umd.edu', code: 'APP-1', answers: [null, null, null], interviewers: ivs,
});

function setup(result: BookResult, held: string | null, rows: InterviewRow[]) {
  const { log, rows: logged } = fakeLog();
  const send = vi.fn<Send>(async () => ({ sent: true, id: 'r' }));
  const book = vi.fn<(slotId: string, note?: string) => Promise<BookResult>>(async () => result);
  const order: string[] = [];
  const d: BookEmailDeps = {
    book: async (slotId, note) => (order.push('book'), book(slotId, note)),
    heldSlot: async () => (order.push('held'), held),
    interviews: async (ids) => rows.filter((r) => ids.includes(r.slotId)),
    cycleInfo: async () => ({ term: 'Fall 2026', award: 'Legacy Scholarship' }),
    log, send, from: 'portal@example.org', portalUrl: 'https://apply.example.org', pauseMs: 0,
  };
  return { d, send, logged, book, order };
}

describe('bookAndNotify', () => {
  it('first booking: booked emails (with invite) to the student and both interviewers', async () => {
    const s = setup({ ok: true, result: 'booked' }, null, [slot('new', '2026-11-12T00:00:00Z')]);
    expect(await bookAndNotify('new', undefined, s.d)).toEqual({ ok: true, result: 'booked' });
    expect(s.send.mock.calls.map((c) => c[0].to).sort()).toEqual(['ada@terpmail.umd.edu', 'k@btx.org', 't@btx.org']);
    const m = s.send.mock.calls[0][0];
    expect(m.subject).toBe('Your interview is booked: Wed Nov 11, 7:00 PM');
    expect(m.attachments?.[0].filename).toBe('btx-interview.ics');
    expect([...s.logged.values()].every((r) => r.kind === 'booked')).toBe(true);
  });

  it('a switch: reads the old pairing BEFORE switching, books the new, and cancels the old interviewers', async () => {
    const old = slot('old', '2026-11-13T00:00:00Z', [person('u3', 'Old One', 'o1@btx.org'), person('u4', 'Old Two', 'o2@btx.org')]);
    const s = setup({ ok: true, result: 'switched' }, 'old', [old, slot('new', '2026-11-12T00:00:00Z')]);
    await bookAndNotify('new', 'a note', s.d);
    expect(s.order.slice(0, 2)).toEqual(['held', 'book']);
    expect(s.book).toHaveBeenCalledWith('new', 'a note');
    const cancels = s.send.mock.calls.map((c) => c[0]).filter((m) => m.subject.startsWith('Interview cancelled'));
    expect(cancels.map((m) => m.to).sort()).toEqual(['o1@btx.org', 'o2@btx.org']);
    expect(Buffer.from(cancels[0].attachments![0].content, 'base64').toString()).toContain('UID:slot-old@thebtxfoundation.org');
    expect(Buffer.from(cancels[0].attachments![0].content, 'base64').toString()).toContain('METHOD:CANCEL');
    expect(s.send).toHaveBeenCalledTimes(5);
  });

  it('sends nothing for unchanged, taken or an error', async () => {
    for (const result of [{ ok: true, result: 'unchanged' }, { ok: false, kind: 'taken' }, { ok: false, kind: 'network' }] as BookResult[]) {
      const s = setup(result, 'old', [slot('new', '2026-11-12T00:00:00Z')]);
      expect(await bookAndNotify('new', undefined, s.d)).toEqual(result);
      expect(s.send).not.toHaveBeenCalled();
    }
  });

  it('books the student alone when nobody is paired yet', async () => {
    const s = setup({ ok: true, result: 'booked' }, null, [slot('new', '2026-11-12T00:00:00Z', [])]);
    await bookAndNotify('new', undefined, s.d);
    expect(s.send.mock.calls.map((c) => c[0].to)).toEqual(['ada@terpmail.umd.edu']);
  });

  it('never twice, and a failing email never undoes the booking', async () => {
    const s = setup({ ok: true, result: 'booked' }, null, [slot('new', '2026-11-12T00:00:00Z')]);
    await bookAndNotify('new', undefined, s.d);
    await bookAndNotify('new', undefined, s.d);
    expect(s.send).toHaveBeenCalledTimes(3);
    const bad = setup({ ok: true, result: 'booked' }, null, [slot('new', '2026-11-12T00:00:00Z')]);
    bad.d.send = async () => {
      throw new Error('down');
    };
    expect(await bookAndNotify('new', undefined, bad.d)).toEqual({ ok: true, result: 'booked' });
    expect(bad.logged.size).toBe(0);
  });

  it('a problem reading the old pairing does not stop the booking', async () => {
    const s = setup({ ok: true, result: 'switched' }, 'old', [slot('new', '2026-11-12T00:00:00Z')]);
    s.d.heldSlot = async () => {
      throw new Error('db');
    };
    expect(await bookAndNotify('new', undefined, s.d)).toEqual({ ok: true, result: 'switched' });
  });

  it('can defer the emails until after the answer', async () => {
    const s = setup({ ok: true, result: 'booked' }, null, [slot('new', '2026-11-12T00:00:00Z')]);
    let deferred: (() => Promise<void>) | null = null;
    s.d.later = (w) => void (deferred = w);
    await bookAndNotify('new', undefined, s.d);
    expect(s.send).not.toHaveBeenCalled();
    await deferred!();
    expect(s.send).toHaveBeenCalledTimes(3);
  });
});
