// Live test of interview_notes row-level security (migration 20261113120000_interview_notes.sql) against the LOCAL
// Supabase stack (never production). Skipped unless LIVE_DB=1:
//   LIVE_DB=1 npx vitest run tests/interview-notes.live.test.ts
// Needs that migration applied locally and the local seed (a published cycle). It creates its own "n7-*@btx.test"
// accounts, two interview times, their pairings and two questions, and removes them again at the end. It reads the local
// keys from apps/ops/.env.local and refuses to run on any other URL.
//
// Who may do what: admins read and write any interview's notes; a board member only the interviews they are one of the
// two interviewers on; anyone else (another board member, an applicant, a signed-out visitor) nothing. Everyone writes
// only their own rows, and a note never moves to another interview, question or author. Removing a question keeps its
// notes: they move into each author's overall notes.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const live = process.env.LIVE_DB === '1';
const env = (() => {
  if (!live) return {} as Record<string, string>;
  const txt = readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8');
  return Object.fromEntries(txt.split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
})();
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const PW = 'n7-local-test-password';

describe.skipIf(!live)('interview_notes row-level security against the local database', () => {
  let svc: SupabaseClient;
  let anon: SupabaseClient;
  let cycleId = '';
  const ids: Record<string, string> = {};
  const c: Record<string, SupabaseClient> = {};
  const slots: string[] = [];
  const questions: string[] = [];
  // slot 0: interviewers b1 + b2. slot 1: b1 + b3.
  const S0 = () => slots[0];
  const S1 = () => slots[1];

  async function user(key: string, role: string, name: string | null) {
    const email = `n7-${key}@btx.test`;
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
    const client = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    const s = await client.auth.signInWithPassword({ email, password: PW });
    if (s.error) throw s.error;
    c[key] = client;
  }

  const note = (slot: string, author: string, questionId: string | null, body: string) => ({ slot_id: slot, question_id: questionId, author_id: author, body });
  const bodies = async (slot: string) => {
    const r = await svc.from('interview_notes').select('question_id, author_id, body').eq('slot_id', slot);
    if (r.error) throw r.error;
    return r.data ?? [];
  };

  beforeAll(async () => {
    expect(URL_).toBe('http://127.0.0.1:55321');
    svc = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    anon = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    const cy = await svc.from('cycles').select('id').eq('status', 'published').order('created_at', { ascending: false }).limit(1).single();
    if (cy.error) throw cy.error;
    cycleId = cy.data.id;
    await user('admin', 'admin', 'N7 Admin');
    await user('b1', 'board', 'N7 Ada Board');
    await user('b2', 'board', 'N7 Bea Board');
    await user('b3', 'board', 'N7 Cy Board');
    await user('b4', 'board', 'N7 Dee Outsider');
    await user('app', 'applicant', null);
    // Two times far ahead (unique per cycle by start), each with its pair.
    const base = Date.parse('2031-03-03T15:00:00Z') + Math.floor(Math.random() * 1000) * 3_600_000;
    for (const [i, pair] of [['b1', 'b2'], ['b1', 'b3']].entries()) {
      const startsAt = new Date(base + i * 3_600_000).toISOString();
      const s = await svc.from('interview_slots').insert({ cycle_id: cycleId, starts_at: startsAt, ends_at: new Date(Date.parse(startsAt) + 30 * 60_000).toISOString() }).select('id').single();
      if (s.error) throw s.error;
      slots.push(s.data.id);
      const p = await svc.from('interview_pairings').upsert({ slot_id: s.data.id, interviewer_a: ids[pair[0]], interviewer_b: ids[pair[1]] }, { onConflict: 'slot_id' });
      if (p.error) throw p.error;
    }
    for (const text of ['N7 first question?', 'N7 second question?']) {
      const q = await svc.from('interview_questions').insert({ cycle_id: cycleId, criterion_key: null, position: 900, text }).select('id').single();
      if (q.error) throw q.error;
      questions.push(q.data.id);
    }
  }, 60_000);

  afterAll(async () => {
    if (!live) return;
    await svc.from('interview_notes').delete().in('slot_id', slots);
    await svc.from('interview_questions').delete().in('id', questions);
    await svc.from('interview_slots').delete().in('id', slots); // pairings go with the slot
  });

  it('a pair member writes and reads their own notes on that interview', async () => {
    const ins = await c.b1.from('interview_notes').insert(note(S0(), ids.b1, questions[0], 'b1 on q1')).select('id');
    expect(ins.error).toBeNull();
    expect(ins.data).toHaveLength(1);
    const ov = await c.b1.from('interview_notes').insert(note(S0(), ids.b1, null, 'b1 overall')).select('id');
    expect(ov.error).toBeNull();
    const up = await c.b1.from('interview_notes').update({ body: 'b1 on q1, edited' }).eq('slot_id', S0()).eq('question_id', questions[0]).eq('author_id', ids.b1).select('id');
    expect(up.data).toHaveLength(1);
    const b2 = await c.b2.from('interview_notes').insert(note(S0(), ids.b2, questions[0], 'b2 on q1')).select('id');
    expect(b2.error).toBeNull();
  });

  it('the other pair member and an admin read every note on the interview', async () => {
    const r2 = await c.b2.from('interview_notes').select('author_id').eq('slot_id', S0());
    expect(new Set((r2.data ?? []).map((r) => r.author_id))).toEqual(new Set([ids.b1, ids.b2]));
    const ra = await c.admin.from('interview_notes').select('author_id').eq('slot_id', S0());
    expect(ra.data).toHaveLength(3);
  });

  it('an admin writes notes on any interview', async () => {
    const r = await c.admin.from('interview_notes').insert(note(S0(), ids.admin, null, 'admin overall')).select('id');
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(1);
  });

  it('a board member who is not on the interview reads nothing and writes nothing', async () => {
    const r = await c.b4.from('interview_notes').select('id').eq('slot_id', S0());
    expect(r.data ?? []).toEqual([]);
    const ins = await c.b4.from('interview_notes').insert(note(S0(), ids.b4, null, 'outsider')).select('id');
    expect(ins.error).not.toBeNull();
    // b3 is on slot 1 only: slot 0 stays closed to them.
    expect((await c.b3.from('interview_notes').select('id').eq('slot_id', S0())).data ?? []).toEqual([]);
    expect((await c.b3.from('interview_notes').insert(note(S0(), ids.b3, null, 'wrong slot')).select('id')).error).not.toBeNull();
    const up = await c.b4.from('interview_notes').update({ body: 'changed' }).eq('slot_id', S0()).select('id');
    expect(up.data ?? []).toEqual([]);
    const del = await c.b4.from('interview_notes').delete().eq('slot_id', S0()).select('id');
    expect(del.data ?? []).toEqual([]);
    expect(await bodies(S0())).toHaveLength(4);
  });

  it('applicants and signed-out visitors get nothing', async () => {
    expect((await c.app.from('interview_notes').select('id').eq('slot_id', S0())).data ?? []).toEqual([]);
    expect((await c.app.from('interview_notes').insert(note(S0(), ids.app, null, 'x')).select('id')).error).not.toBeNull();
    const a = await anon.from('interview_notes').select('id').eq('slot_id', S0());
    expect(a.data ?? []).toEqual([]);
    expect((await anon.from('interview_notes').insert(note(S0(), ids.b1, null, 'x')).select('id')).error).not.toBeNull();
  });

  it('nobody writes as someone else, and nobody changes another person’s note', async () => {
    expect((await c.b1.from('interview_notes').insert(note(S0(), ids.b2, null, 'as b2')).select('id')).error).not.toBeNull();
    expect((await c.admin.from('interview_notes').insert(note(S0(), ids.b1, questions[1], 'as b1')).select('id')).error).not.toBeNull();
    const up = await c.b1.from('interview_notes').update({ body: 'hijack' }).eq('slot_id', S0()).eq('author_id', ids.b2).select('id');
    expect(up.data ?? []).toEqual([]);
    const del = await c.b1.from('interview_notes').delete().eq('slot_id', S0()).eq('author_id', ids.b2).select('id');
    expect(del.data ?? []).toEqual([]);
    const b2 = (await bodies(S0())).find((r) => r.author_id === ids.b2);
    expect(b2?.body).toBe('b2 on q1');
  });

  it('a note never moves to another interview, question or author', async () => {
    // b1 is on both interviews, so only the check trigger stands in the way of the move.
    expect((await c.b1.from('interview_notes').update({ slot_id: S1() }).eq('slot_id', S0()).eq('author_id', ids.b1).eq('question_id', questions[0]).select('id')).error).not.toBeNull();
    expect((await c.b1.from('interview_notes').update({ question_id: questions[1] }).eq('slot_id', S0()).eq('author_id', ids.b1).eq('question_id', questions[0]).select('id')).error).not.toBeNull();
    expect((await c.b1.from('interview_notes').update({ author_id: ids.b2 }).eq('slot_id', S0()).eq('author_id', ids.b1).eq('question_id', questions[0]).select('id')).error).not.toBeNull();
    expect((await c.admin.from('interview_notes').update({ author_id: ids.b1 }).eq('slot_id', S0()).eq('author_id', ids.admin).select('id')).error).not.toBeNull();
    const rows = await bodies(S0());
    expect(rows.find((r) => r.author_id === ids.b1 && r.question_id === questions[0])?.body).toBe('b1 on q1, edited');
  });

  it('a pair member deletes only their own notes', async () => {
    const add = await c.b1.from('interview_notes').insert(note(S1(), ids.b1, questions[1], 'temp')).select('id');
    expect(add.error).toBeNull();
    const del = await c.b1.from('interview_notes').delete().eq('slot_id', S1()).eq('author_id', ids.b1).select('id');
    expect(del.data).toHaveLength(1);
  });

  it('removing a question moves its notes into each author’s overall notes', async () => {
    const d = await svc.from('interview_questions').delete().eq('id', questions[0]);
    expect(d.error).toBeNull();
    const rows = await bodies(S0());
    expect(rows.some((r) => r.question_id === questions[0])).toBe(false);
    // b1 had overall notes: the question's words are appended to them.
    expect(rows.find((r) => r.author_id === ids.b1 && r.question_id === null)?.body).toBe('b1 overall\n\nN7 first question?\nb1 on q1, edited');
    // b2 had none: an overall row is made.
    expect(rows.find((r) => r.author_id === ids.b2 && r.question_id === null)?.body).toBe('N7 first question?\nb2 on q1');
    questions.shift();
  });
});
