// Live test of lib/interview-flow-db.ts against the LOCAL Supabase stack (never production). Skipped unless LIVE_DB=1:
//   LIVE_DB=1 npx vitest run tests/interview-flow-db.live.test.ts
// It makes its own draft cycle (interview days 10 to 12 days from now), "if-*@btx.test" accounts, applications,
// times and bookings, and removes them at the end. It reads the local keys from apps/ops/.env.local and refuses to
// run on any other URL.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  addTime,
  deleteQuestion,
  moveQuestion,
  openProposedTimes,
  readBoardAvailability,
  readFairness,
  readMyAvailability,
  readProposedTimes,
  readQuestions,
  rebalanceInterviews,
  rebuildProposedTimes,
  removeTime,
  saveMyAvailability,
  saveQuestion,
  seedStarterQuestions,
} from '@/lib/interview-flow-db';
import { easternToUtc } from '@/lib/pairing-slots';
import type { Db } from '@/lib/pairing-db';

const live = process.env.LIVE_DB === '1';
const env = (() => {
  if (!live) return {} as Record<string, string>;
  const txt = readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8');
  return Object.fromEntries(txt.split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
})();
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const PW = 'if-local-test-password';

describe.skipIf(!live)('interview-flow-db against the local database', () => {
  let svc: SupabaseClient;
  let cycleId = '';
  const ids: Record<string, string> = {};
  const clients: Record<string, Db> = {};
  const appIds: Record<string, string> = {};
  const ymd = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const d0 = ymd(10);
  const d1 = ymd(11);
  const at = (day: string, hhmm: string) => easternToUtc(day, hhmm) as string;
  const same = (a: string, b: string) => Date.parse(a) === Date.parse(b);

  async function user(key: string, role: string, name: string | null) {
    const email = `if-${key}@btx.test`;
    const made = await svc.auth.admin.createUser({ email, password: PW, email_confirm: true, app_metadata: { role } });
    let id = made.data.user?.id;
    if (!id) {
      const list = await svc.auth.admin.listUsers({ perPage: 200 });
      id = list.data.users.find((u) => u.email === email)?.id;
    }
    if (!id) throw made.error;
    await svc.auth.admin.updateUserById(id, { app_metadata: { role }, password: PW });
    if (name) await svc.from('staff_profiles').upsert({ user_id: id, display_name: name, initials: name.split(' ').map((w) => w[0]).join('') });
    ids[key] = id;
    const c = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    const s = await c.auth.signInWithPassword({ email, password: PW });
    if (s.error) throw s.error;
    clients[key] = c as Db;
  }

  async function apply(key: string, fullName: string, code: string) {
    const a = await svc.from('applications').insert({ cycle_id: cycleId, user_id: ids[key], terpmail: `if-${key}@btx.test`, full_name: fullName, agreed_true: true, status: 'submitted', applicant_code: code, submitted_at: new Date().toISOString() }).select('id').single();
    if (a.error) throw a.error;
    appIds[key] = a.data.id;
  }

  beforeAll(async () => {
    expect(URL_).toBe('http://127.0.0.1:55321');
    svc = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const cy = await svc.from('cycles').insert({ term: 'IF live test', year: 2099, status: 'draft', award_name: 'Legacy', award_amount_cents: 200000, interview_start: d0, interview_end: ymd(12) }).select('id').single();
    if (cy.error) throw cy.error;
    cycleId = cy.data.id;
    const keys = ['community', 'resilience', 'leadership', 'financial', 'communication', 'passion'];
    const rb = await svc.from('rubric_criteria').insert(keys.map((key, i) => ({ cycle_id: cycleId, key, name: key, weight: i < 4 ? 20 : 10, position: i + 1 })));
    if (rb.error) throw rb.error;
    await user('admin', 'admin', 'IF Admin');
    await user('ana', 'board', 'IF Ana');
    await user('ben', 'board', 'IF Ben');
    await user('cal', 'board', 'IF Cal');
    for (const k of ['app1', 'app2', 'app3']) await user(k, 'applicant', null);
    await apply('app1', 'Ada Okafor', 'APP-2099-IF001');
    await apply('app2', 'Bea Lin', 'APP-2099-IF002');
    await apply('app3', 'Cy Doe', 'APP-2099-IF003');
  }, 60_000);

  afterAll(async () => {
    if (!live || !cycleId) return;
    const slots = await svc.from('interview_slots').select('id').eq('cycle_id', cycleId);
    await svc.from('bookings').delete().in('slot_id', (slots.data ?? []).map((s) => s.id));
    await svc.from('applications').delete().eq('cycle_id', cycleId);
    await svc.from('cycles').delete().eq('id', cycleId); // ranges, prefs, names, questions, rubric, times and pairs go with it
  });

  it("saves a board member's own availability, limit, note and private names, and records Send", async () => {
    const r = await saveMyAvailability(clients.ana, cycleId, {
      ranges: [
        { day: d0, start: '09:10', end: '12:00' },
        { day: d0, start: '11:00', end: '13:00' },
        { day: '2030-01-01', start: '09:00', end: '10:00' },
      ],
      maxInterviews: 3,
      text: 'Tuesday morning',
      conflicts: ['Ada  Okafor', 'ada okafor', 'Someone Else'],
      send: true,
    });
    expect(r).toMatchObject({ ok: true, ranges: [{ day: d0, start: '09:00', end: '13:00' }] });
    const sentAt = r.ok ? r.sentAt : null;
    expect(sentAt).toBeTruthy();
    const mine = await readMyAvailability(clients.ana, cycleId);
    expect(mine).toMatchObject({ ok: true, availability: { maxInterviews: 3, text: 'Tuesday morning', conflicts: ['Ada Okafor', 'Someone Else'] } });
    // Saving again without Send keeps the sent time and replaces the names.
    expect(await saveMyAvailability(clients.ana, cycleId, { ranges: [{ day: d0, start: '09:00', end: '13:00' }], maxInterviews: 3, text: 'Tuesday morning', conflicts: ['Ada Okafor'], send: false })).toMatchObject({ ok: true, sentAt });
    expect(await readMyAvailability(clients.ana, cycleId)).toMatchObject({ ok: true, availability: { conflicts: ['Ada Okafor'] } });
    // Nobody else reads her names, admins included.
    const peek = await clients.admin.from('board_conflicts').select('name').eq('cycle_id', cycleId);
    expect(peek.data).toEqual([]);
  });

  it('refuses bad input and non-board accounts', async () => {
    const base = { ranges: [], text: '', conflicts: [], send: false };
    expect(await saveMyAvailability(clients.ben, cycleId, { ...base, maxInterviews: 0 })).toMatchObject({ ok: false });
    expect(await saveMyAvailability(clients.ben, cycleId, { ...base, maxInterviews: null, ranges: [{ day: d0, start: '11:00', end: '10:00' }] })).toMatchObject({ ok: false });
    expect(await saveMyAvailability(clients.app1, cycleId, { ...base, maxInterviews: null })).toMatchObject({ ok: false });
    expect(await readMyAvailability(clients.app1, cycleId)).toMatchObject({ ok: false });
  });

  it('lists every board member with free hours, limit and sent time', async () => {
    expect(await saveMyAvailability(clients.ben, cycleId, { ranges: [{ day: d0, start: '09:00', end: '11:00' }, { day: d1, start: '09:00', end: '10:00' }], maxInterviews: null, text: '', conflicts: [], send: true })).toMatchObject({ ok: true });
    expect(await saveMyAvailability(clients.cal, cycleId, { ranges: [{ day: d0, start: '10:00', end: '12:00' }, { day: d1, start: '09:00', end: '10:00' }], maxInterviews: null, text: '', conflicts: [], send: true })).toMatchObject({ ok: true });
    const all = await readBoardAvailability(clients.ben, cycleId);
    expect(all.ok).toBe(true);
    if (!all.ok) return;
    const ana = all.people.find((p) => p.userId === ids.ana)!;
    expect(ana).toMatchObject({ freeHours: 4, maxInterviews: 3 });
    expect(ana.sentAt).toBeTruthy();
    expect(Object.keys(ana)).not.toContain('conflicts');
    expect(all.people.find((p) => p.userId === ids.admin)).toMatchObject({ freeHours: 0, sentAt: null });
    expect(await readBoardAvailability(clients.app1, cycleId)).toMatchObject({ ok: false });
  });

  it('proposes times where two or more are free, lets an admin add and remove one, and opens them', async () => {
    expect(await rebuildProposedTimes(clients.ben, cycleId)).toMatchObject({ ok: false });
    // 3 applicants: ceil(3.9) = 4 times, one day at a time: d0 10:00, d1 9:00, d0 10:30, d1 9:30.
    expect(await rebuildProposedTimes(clients.admin, cycleId)).toEqual({ ok: true, removed: 0, added: 4 });
    const p = await readProposedTimes(clients.ben, cycleId);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.times.map((t) => [t.freeCount, t.openedAt])).toEqual([[3, null], [3, null], [2, null], [2, null]]);
    expect(same(p.times[0].startsAt, at(d0, '10:00'))).toBe(true);
    expect(same(p.times[2].startsAt, at(d1, '09:00'))).toBe(true);
    // Again: the same 4 are removed and made again.
    expect(await rebuildProposedTimes(clients.admin, cycleId)).toEqual({ ok: true, removed: 4, added: 4 });

    expect(await addTime(clients.ben, cycleId, d0, '12:00')).toMatchObject({ ok: false });
    expect(await addTime(clients.admin, cycleId, '2030-01-01', '12:00')).toMatchObject({ ok: false });
    expect(await addTime(clients.admin, cycleId, d0, '10:15')).toMatchObject({ ok: false }); // overlaps
    const added = await addTime(clients.admin, cycleId, d0, '12:00');
    expect(added).toMatchObject({ ok: true });
    if (!added.ok) return;
    expect(await removeTime(clients.ben, added.slotId)).toMatchObject({ ok: false });
    expect(await removeTime(clients.admin, added.slotId)).toEqual({ ok: true });

    const before = await clients.app1.rpc('open_interview_slots', { p_cycle_id: cycleId });
    expect(before.data).toEqual([]);
    expect(await openProposedTimes(clients.ben, cycleId)).toMatchObject({ ok: false });
    expect(await openProposedTimes(clients.admin, cycleId)).toEqual({ ok: true, opened: 4 });
    const after = await clients.app1.rpc('open_interview_slots', { p_cycle_id: cycleId });
    expect(after.data).toHaveLength(4);
  });

  let slot: (day: string, hhmm: string) => string = () => '';
  it('pairs two people when each student books', async () => {
    const p = await readProposedTimes(clients.admin, cycleId);
    if (!p.ok) throw new Error(p.message);
    slot = (day: string, hhmm: string) => p.times.find((t) => same(t.startsAt, at(day, hhmm)))!.slotId;
    for (const [k, day, hhmm] of [['app1', d1, '09:00'], ['app2', d0, '10:00'], ['app3', d0, '10:30']] as const) {
      const b = await clients[k].rpc('switch_booking', { p_new_slot: slot(day, hhmm) });
      expect(b.data).toBe('booked');
    }
    const pairs = await svc.from('interview_pairings').select('slot_id, interviewer_a, interviewer_b');
    const of = (id: string) => {
      const r = (pairs.data ?? []).find((x) => x.slot_id === id)!;
      return new Set([r.interviewer_a, r.interviewer_b]);
    };
    expect(of(slot(d1, '09:00'))).toEqual(new Set([ids.ben, ids.cal]));
    expect(of(slot(d0, '10:00'))).toEqual(new Set([ids.ana, ids.ben]));
    expect(of(slot(d0, '10:30'))).toEqual(new Set([ids.ana, ids.cal]));
  });

  it('shows fairness and rebalances future interviews from people over the target to people under it', async () => {
    // Make Ben hold one too many: he takes Ana's place at d0 10:30.
    await svc.from('interview_pairings').update({ interviewer_a: ids.cal, interviewer_b: ids.ben }).eq('slot_id', slot(d0, '10:30'));
    const f = await readFairness(clients.ben, cycleId);
    expect(f.ok).toBe(true);
    if (!f.ok) return;
    const row = (u: string) => f.people.find((p) => p.userId === u)!;
    expect(row(ids.ben)).toMatchObject({ interviews: 3, target: 2, overBy: 1 });
    expect(row(ids.ana)).toMatchObject({ interviews: 1, target: 2, overBy: -1, maxInterviews: 3 });
    expect(row(ids.admin)).toMatchObject({ target: null });
    expect(f.needsTwo).toEqual([]);

    expect(await rebalanceInterviews(clients.ben, cycleId)).toMatchObject({ ok: false });
    // Nothing moves when every interview starts within 48 hours of "now".
    expect(await rebalanceInterviews(clients.admin, cycleId, new Date(Date.now() + 12 * 86_400_000))).toMatchObject({ ok: true, moves: [] });
    const r = await rebalanceInterviews(clients.admin, cycleId);
    expect(r).toMatchObject({ ok: true, moves: [{ slotId: slot(d0, '10:30'), from: ids.ben, to: ids.ana, fromName: 'IF Ben', toName: 'IF Ana', code: 'APP-2099-IF003' }] });
    if (!r.ok) return;
    expect(r.after[ids.ben]).toBe(2);
    expect(r.after[ids.ana]).toBe(2);
    const pr = await svc.from('interview_pairings').select('interviewer_a, interviewer_b').eq('slot_id', slot(d0, '10:30')).single();
    expect(new Set([pr.data!.interviewer_a, pr.data!.interviewer_b])).toEqual(new Set([ids.cal, ids.ana]));
  });

  it('adds the starter questions, and only admins add, edit, reorder and remove', async () => {
    expect(await seedStarterQuestions(clients.ben, cycleId)).toMatchObject({ ok: false });
    expect(await seedStarterQuestions(clients.admin, cycleId)).toEqual({ ok: true, added: 12 });
    expect(await seedStarterQuestions(clients.admin, cycleId)).toEqual({ ok: true, added: 0 });
    const q = await readQuestions(clients.ben, cycleId);
    expect(q).toMatchObject({ ok: true });
    if (!q.ok) return;
    expect(q.questions).toHaveLength(12);
    expect(q.questions.filter((x) => x.criterionKey === null)).toHaveLength(2);

    expect(await saveQuestion(clients.ben, cycleId, { criterionKey: 'community', text: 'Mine' })).toMatchObject({ ok: false });
    expect(await saveQuestion(clients.admin, cycleId, { criterionKey: 'nope', text: 'Mine' })).toMatchObject({ ok: false });
    expect(await saveQuestion(clients.admin, cycleId, { criterionKey: 'community', text: '   ' })).toMatchObject({ ok: false });
    const s = await saveQuestion(clients.admin, cycleId, { criterionKey: 'community', text: 'What club would you start?' });
    expect(s).toMatchObject({ ok: true });
    if (!s.ok) return;
    expect(await saveQuestion(clients.admin, cycleId, { id: s.id, criterionKey: 'community', text: 'What club would you start, and why?' })).toEqual({ ok: true, id: s.id });

    expect(await moveQuestion(clients.ben, s.id, 'up')).toMatchObject({ ok: false });
    expect(await moveQuestion(clients.admin, s.id, 'up')).toEqual({ ok: true });
    const after = await readQuestions(clients.ben, cycleId);
    if (!after.ok) throw new Error(after.message);
    expect(after.questions.filter((x) => x.criterionKey === 'community').map((x) => x.text)).toEqual([
      'Tell us about a community you’re part of and what you’ve given back to it.',
      'What club would you start, and why?',
      'Why does community matter to you as an engineer?',
    ]);
    // The other groups keep their places.
    expect(after.questions.find((x) => x.criterionKey === 'resilience')!.position).toBe(3);

    expect(await deleteQuestion(clients.ben, s.id)).toMatchObject({ ok: false });
    expect(await deleteQuestion(clients.admin, s.id)).toEqual({ ok: true });
    expect(await deleteQuestion(clients.admin, s.id)).toMatchObject({ ok: false });
  });
});
