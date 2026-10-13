import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendMail, type Mail, type SendResult } from '@btx/emails';

type Send = (mail: Mail, from?: string) => Promise<SendResult>;
import { lastSent, sendBookingInvites, sendDecisionEmails, sendStaffInvite, type Deps } from '@/lib/email/send';
import type { ApplicantRow, AwardRow, ClaimRow, CycleRow, EmailKind, EmailStore, LogRow } from '@/lib/email/store';

// An in-memory store with the same "never twice" rule as the database's unique index.
function fakeStore(init: { cycle?: Partial<CycleRow> | null; applicants?: ApplicantRow[]; booked?: string[]; awards?: AwardRow[]; log?: (ClaimRow & { sent_at?: string })[] }) {
  const cycle: CycleRow | null =
    init.cycle === null
      ? null
      : { id: 'c1', term: 'Fall 2026', award_name: 'Legacy Scholarship', award_amount_cents: 200000, interview_end: '2026-10-09', photo_due: '2026-11-06', decisions_released_at: null, ...init.cycle };
  const rows: (ClaimRow & { id: string; resend_id: string | null; sent_at: string })[] = (init.log ?? []).map((r, i) => ({
    id: `old${i}`, resend_id: null, sent_at: r.sent_at ?? '2026-10-01T00:00:00Z', ...r,
  }));
  let n = 0;
  const store: EmailStore = {
    cycle: async () => cycle,
    submittedApplicants: async () => init.applicants ?? [],
    bookedApplicationIds: async () => new Set(init.booked ?? []),
    awards: async () => init.awards ?? [],
    loggedApplicationIds: async (kind, c) => new Set(rows.filter((r) => r.kind === kind && r.cycle_id === c && r.application_id).map((r) => r.application_id!)),
    claim: async (row) => {
      if (row.application_id && rows.some((r) => r.kind === row.kind && r.application_id === row.application_id)) return false;
      const id = `new${n++}`;
      rows.push({ ...row, id, resend_id: null, sent_at: '2026-11-09T14:02:00Z' });
      return id;
    },
    setResendId: async (id, rid) => { rows.find((r) => r.id === id)!.resend_id = rid; },
    release: async (id) => { rows.splice(rows.findIndex((r) => r.id === id), 1); },
    log: async (kind, c) => rows.filter((r) => r.kind === kind && (!c || r.cycle_id === c)).sort((a, b) => b.sent_at.localeCompare(a.sent_at)) as LogRow[],
  };
  return { store, rows };
}

const person = (id: string, name: string | null, mail = `${id}@terpmail.umd.edu`): ApplicantRow => ({ id, full_name: name, terpmail: mail, applicant_code: `APP-2026-${id}` });
const okSend = () => vi.fn<Send>(async () => ({ sent: true, id: 'rs_1' }));
const deps = (store: EmailStore, send: ReturnType<typeof okSend> = okSend(), extra: Deps = {}): Deps => ({
  store, send, isAdmin: async () => true, pauseMs: 0, portalUrl: 'https://apply.example.org', now: () => new Date('2026-11-09T14:02:00Z'), from: 'ops@example.org', ...extra,
});

describe('sendBookingInvites', () => {
  const applicants = [person('a1', 'Ebony Coleman'), person('a2', 'Marcus Lee'), person('a3', null)];

  it('emails submitted applicants with no booking and no earlier invite, with the last interview day as the book-by date', async () => {
    const { store, rows } = fakeStore({ applicants, booked: ['a2'] });
    const send = okSend();
    const r = await sendBookingInvites('c1', deps(store, send));
    expect(r).toMatchObject({ ok: true, sent: 2, skipped: 1, failed: 0, notConfigured: false, at: '2026-11-09T14:02:00.000Z' });
    const mails = send.mock.calls.map((c) => c[0]);
    expect(mails.map((m) => m.to)).toEqual(['a1@terpmail.umd.edu', 'a3@terpmail.umd.edu']);
    expect(mails[0].subject).toBe('Schedule your interview by Fri Oct 9');
    expect(mails[0].html).toContain('Hi Ebony, please pick one by Fri Oct 9.');
    expect(mails[0].html).toContain('https://apply.example.org/status/schedule');
    expect(mails[1].html).toContain('Hi there,'); // no name on file
    expect(send.mock.calls[0][1]).toBe('ops@example.org');
    expect(rows.filter((x) => x.kind === 'book').map((x) => x.resend_id)).toEqual(['rs_1', 'rs_1']);
  });

  it('never sends twice: a second run sends nothing', async () => {
    const { store } = fakeStore({ applicants });
    const send = okSend();
    await sendBookingInvites('c1', deps(store, send));
    const again = await sendBookingInvites('c1', deps(store, send));
    expect(again).toMatchObject({ ok: true, sent: 0, skipped: 3 });
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('skips someone already logged, even if the log was written between reading and sending', async () => {
    const { store } = fakeStore({ applicants: [person('a1', 'Ebony')], log: [{ kind: 'book', cycle_id: 'c1', application_id: 'a1', to_address: 'x' }] });
    const send = okSend();
    expect(await sendBookingInvites('c1', deps(store, send))).toMatchObject({ sent: 0, skipped: 1 });
    expect(send).not.toHaveBeenCalled();
  });

  it('gives the slot back when a send fails, so a retry can send it', async () => {
    const { store, rows } = fakeStore({ applicants: [person('a1', 'Ebony')] });
    const bad = vi.fn<Send>(async () => ({ sent: false, reason: 'resend-500' }));
    expect(await sendBookingInvites('c1', deps(store, bad))).toMatchObject({ sent: 0, failed: 1 });
    expect(rows).toHaveLength(0);
    expect(await sendBookingInvites('c1', deps(store, okSend()))).toMatchObject({ sent: 1, failed: 0 });
  });

  it('is admin only and needs an interview end date', async () => {
    const { store } = fakeStore({ applicants });
    expect(await sendBookingInvites('c1', { ...deps(store), isAdmin: async () => false })).toEqual({ ok: false, reason: 'not-admin' });
    const none = fakeStore({ applicants, cycle: { interview_end: null } });
    expect(await sendBookingInvites('c1', deps(none.store))).toEqual({ ok: false, reason: 'no-interview-end' });
    expect(await sendBookingInvites('c1', deps(fakeStore({ cycle: null }).store))).toEqual({ ok: false, reason: 'no-cycle' });
  });

  it('reports "not configured" and logs nothing when the email service is not set up', async () => {
    const { store, rows } = fakeStore({ applicants });
    const r = await sendBookingInvites('c1', deps(store, vi.fn<Send>(async () => ({ sent: false, reason: 'not-configured' }))));
    expect(r).toMatchObject({ ok: true, sent: 0, failed: 0, notConfigured: true });
    expect(rows).toHaveLength(0);
  });
});

describe('sendDecisionEmails', () => {
  const released = { decisions_released_at: '2026-11-08T12:00:00Z' };
  const applicants = [person('w1', 'Ebony Coleman'), person('n1', 'Marcus Lee'), person('n2', 'Priya Shah'), person('x1', 'Extra Winner')];
  const awards: AwardRow[] = [
    { application_id: 'w1', award_name: 'Legacy', amount_cents: 200000, kind: 'main' },
    { application_id: 'x1', award_name: 'Empowerment', amount_cents: null, kind: 'extra' },
  ];

  it('refuses until decisions are released (unset, or in the future)', async () => {
    const send = okSend();
    const a = fakeStore({ applicants, awards });
    expect(await sendDecisionEmails('c1', deps(a.store, send))).toEqual({ ok: false, reason: 'not-released' });
    const b = fakeStore({ applicants, awards, cycle: { decisions_released_at: '2026-12-01T00:00:00Z' } });
    expect(await sendDecisionEmails('c1', deps(b.store, send))).toEqual({ ok: false, reason: 'not-released' });
    expect(send).not.toHaveBeenCalled();
  });

  it('sends "you won" to winners and "not picked" to everyone else submitted', async () => {
    const { store, rows } = fakeStore({ applicants, awards, cycle: released });
    const send = okSend();
    const r = await sendDecisionEmails('c1', deps(store, send));
    expect(r).toMatchObject({ ok: true, sent: 4, skipped: 0, won: 2, notPicked: 2 });
    const by = Object.fromEntries(send.mock.calls.map((c) => [c[0].to.split('@')[0], c[0]]));
    expect(by.w1.subject).toBe('You won the Legacy Scholarship');
    expect(by.w1.html).toContain('Congratulations, Ebony.');
    expect(by.w1.html).toContain('$2,000');
    expect(by.w1.html).toContain('Fri Nov 6');
    expect(by.x1.subject).toBe('You won the Empowerment');
    expect(by.x1.html).toContain('$2,000'); // the extra award has no amount of its own: the cycle's amount is used
    expect(by.n1.subject).toBe('Your Legacy Scholarship application');
    expect(by.n1.html).not.toContain('Empowerment');
    expect(rows.map((x) => x.kind).sort()).toEqual(['not-picked', 'not-picked', 'won', 'won']);
  });

  it('never twice, and a late-added winner still gets their own email', async () => {
    const first = fakeStore({ applicants, awards: [awards[0]], cycle: released });
    const send = okSend();
    await sendDecisionEmails('c1', deps(first.store, send));
    expect(send).toHaveBeenCalledTimes(4);
    const again = await sendDecisionEmails('c1', deps(first.store, send));
    expect(again).toMatchObject({ sent: 0, skipped: 4 });
    expect(send).toHaveBeenCalledTimes(4);
  });

  it('ignores people who did not submit (the store only returns submitted applicants) and is admin only', async () => {
    const { store } = fakeStore({ applicants: [], awards, cycle: released });
    const send = okSend();
    expect(await sendDecisionEmails('c1', deps(store, send))).toMatchObject({ sent: 0 });
    expect(await sendDecisionEmails('c1', { ...deps(store, send), isAdmin: async () => false })).toEqual({ ok: false, reason: 'not-admin' });
  });
});

describe('sendStaffInvite', () => {
  it('names the role and the sign-in address, and logs the send', async () => {
    const { store, rows } = fakeStore({});
    const send = okSend();
    const r = await sendStaffInvite({ name: 'Kelsey Davis', email: 'kelsey@example.org', role: 'board' }, deps(store, send, { opsUrl: 'https://ops.example.org/' }));
    expect(r).toEqual({ ok: true, sent: true, reason: undefined });
    const mail = send.mock.calls[0][0];
    expect(mail.to).toBe('kelsey@example.org');
    expect(mail.subject).toBe("You're on the BTX Ops Hub as a board member");
    expect(mail.text).toContain('Sign in at https://ops.example.org with this email address; we\'ll send you a code.');
    expect(rows[0]).toMatchObject({ kind: 'staff-invite', to_address: 'kelsey@example.org', application_id: null });
  });
  it('labels each role', async () => {
    const { store } = fakeStore({});
    const send = okSend();
    await sendStaffInvite({ name: 'A', email: 'a@example.org', role: 'admin' }, deps(store, send, { opsUrl: 'https://o' }));
    await sendStaffInvite({ name: 'B', email: 'b@example.org', role: 'board' }, deps(store, send, { opsUrl: 'https://o' }));
    expect(send.mock.calls.map((c) => c[0].subject)).toEqual(["You're on the BTX Ops Hub as a board member with admin rights", "You're on the BTX Ops Hub as a board member"]);
  });
  it('refuses a reviewer role (staff are admin or board only)', async () => {
    const { store } = fakeStore({});
    const send = okSend();
    expect(await sendStaffInvite({ name: 'B', email: 'b@example.org', role: 'reviewer' as never }, deps(store, send, { opsUrl: 'https://o' }))).toEqual({ ok: false, reason: 'bad-input' });
    expect(send).not.toHaveBeenCalled();
  });
  it('rejects bad input, non-admins and a missing Ops Hub address', async () => {
    const { store } = fakeStore({});
    const d = deps(store, okSend(), { opsUrl: 'https://o' });
    expect(await sendStaffInvite({ name: '', email: 'a@example.org', role: 'admin' }, d)).toEqual({ ok: false, reason: 'bad-input' });
    expect(await sendStaffInvite({ name: 'A', email: 'nope', role: 'admin' }, d)).toEqual({ ok: false, reason: 'bad-input' });
    expect(await sendStaffInvite({ name: 'A', email: 'a@example.org', role: 'owner' as never }, d)).toEqual({ ok: false, reason: 'bad-input' });
    expect(await sendStaffInvite({ name: 'A', email: 'a@example.org', role: 'admin' }, { ...d, isAdmin: async () => false })).toEqual({ ok: false, reason: 'not-admin' });
    delete process.env.OPS_HUB_URL;
    expect(await sendStaffInvite({ name: 'A', email: 'a@example.org', role: 'admin' }, { ...deps(store), opsUrl: undefined })).toEqual({ ok: false, reason: 'no-ops-url' });
  });
});

describe('lastSent', () => {
  const row = (at: string, i: number) => ({ kind: 'book' as EmailKind, cycle_id: 'c1', application_id: `a${i}`, to_address: 'x', sent_at: at });
  it('counts only the latest batch (sends less than ten minutes apart)', async () => {
    const { store } = fakeStore({ log: [row('2026-11-02T09:00:00Z', 1), row('2026-11-02T09:01:00Z', 2), row('2026-11-09T09:00:00Z', 3), row('2026-11-09T09:02:00Z', 4), row('2026-11-09T09:05:00Z', 5)] });
    expect(await lastSent('book', 'c1', deps(store))).toEqual({ count: 3, at: '2026-11-09T09:05:00Z' });
  });
  it('is empty when nothing was sent or the caller is not an admin', async () => {
    const { store } = fakeStore({ log: [row('2026-11-09T09:00:00Z', 1)] });
    expect(await lastSent('won', 'c1', deps(store))).toEqual({ count: 0, at: null });
    expect(await lastSent('book', 'c1', { ...deps(store), isAdmin: async () => false })).toEqual({ count: 0, at: null });
  });
});

describe('sendMail (Resend, fetch mocked)', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  const mail = { to: 'a@example.org', subject: 'S', html: '<p>h</p>', text: 't', idempotencyKey: 'k-1' };

  it('posts to Resend with the given from-address and returns the id', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'rs_9' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await sendMail(mail, 'ops@example.org')).toEqual({ sent: true, id: 'rs_9' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(JSON.parse(init.body as string)).toMatchObject({ from: 'ops@example.org', to: ['a@example.org'], subject: 'S' });
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('k-1');
  });
  it('only logs when the key or the from-address is missing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('RESEND_API_KEY', '');
    expect(await sendMail(mail, 'ops@example.org')).toEqual({ sent: false, reason: 'not-configured' });
    vi.stubEnv('RESEND_API_KEY', 're_test');
    expect(await sendMail(mail, undefined)).toEqual({ sent: false, reason: 'not-configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('reports a Resend error and a network failure', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429 })));
    expect(await sendMail(mail, 'f@x.org')).toEqual({ sent: false, reason: 'resend-429' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    expect(await sendMail(mail, 'f@x.org')).toEqual({ sent: false, reason: 'network' });
  });
});
