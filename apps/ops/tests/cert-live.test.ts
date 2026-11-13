// Certifications live reads with a stand-in reader (lib/cert-live.ts): the full view, core failures to the load error,
// a chat failure that marks only the chat, a missing program, and the 100-id chunks.
import { describe, expect, it } from 'vitest';
import { CHAT_LAST, loadLiveCertView, type CertReader, type CertReadOpts } from '@/lib/cert-live';

type Row = Record<string, unknown>;
const NOW = new Date('2026-11-10T15:00:00Z');

// A reader answering from `tables`; `fail` names tables that throw; every call is recorded.
function reader(tables: Record<string, Row[]>, fail: string[] = []) {
  const calls: { kind: string; table: string; o: CertReadOpts }[] = [];
  const answer = async (kind: string, table: string, o: CertReadOpts) => {
    calls.push({ kind, table, o });
    if (fail.includes(table)) throw new Error('no');
    let rows = tables[table] ?? [];
    for (const [c, v] of Object.entries(o.in ?? {})) rows = rows.filter((r) => v.includes(r[c]));
    return o.limit ? rows.slice(0, o.limit) : rows;
  };
  const r: CertReader = { rows: (t, _s, o) => answer('rows', t, o), all: (t, _s, o) => answer('all', t, o) };
  return { r, calls };
}

const base = (): Record<string, Row[]> => ({
  staff_profiles: [
    { user_id: 'u1', display_name: 'Dana Mercer', initials: 'DM' },
    { user_id: 'u2', display_name: 'Toby Faraday', initials: 'TF' },
  ],
  programs: [{ id: 'p1', status: 'setting_up', pilot_budget_cents: 0, students_target: 5, cost_per_student_cents: null, summary: 'BTX pays exam fees' }],
  checklists: [{ id: 'c1', position: 1 }],
  certification_ideas: [{ id: 'i1', name: 'FE', decision: 'not_decided', suggested_by: 'u2', created_at: '2026-11-01' }],
  tasks: [
    { id: 't1', checklist_id: 'c1', title: 'Pick the first certifications', status: 'open', position: 1 },
    { id: 't2', checklist_id: 'c1', title: 'Approve the pilot budget', status: 'open', type: 'approval', position: 2 },
  ],
  task_assignees: [{ task_id: 't1', user_id: 'u2' }],
  chat_channels: [{ id: 'ch' }],
  chat_messages: [{ id: 'm1', author_id: 'u2', is_bot: false, body: 'Hi', created_at: '2026-11-10T13:00:00Z' }],
});

describe('loadLiveCertView', () => {
  it('builds the view', async () => {
    const { r, calls } = reader(base());
    const v = await loadLiveCertView(r, { id: 'u1', role: 'board' }, NOW);
    if (v.failed) throw new Error('failed');
    expect(v).toMatchObject({ programId: 'p1', checklistId: 'c1', status: 'In setup', loadFailed: false });
    expect(v.steps.map((s) => [s.id, s.ideas, s.approval, s.owner?.name ?? null])).toEqual([
      ['t1', true, false, 'Toby Faraday'],
      ['t2', false, true, null],
    ]);
    expect(v.ideas[0]).toMatchObject({ name: 'FE', by: 'Toby Faraday', decision: 'open' });
    expect(v.chat).toMatchObject({ channelId: 'ch', failed: false });
    expect(v.chat.messages[0]).toMatchObject({ who: 'Toby Faraday', text: 'Hi' });
    expect(v.caps).toMatchObject({ tick: true, addTask: true, addIdea: true, chat: true, decide: false, undo: false });
    expect(calls.find((c) => c.table === 'chat_messages')?.o.limit).toBe(CHAT_LAST);
    expect(calls.find((c) => c.table === 'tasks')?.kind).toBe('all');
  });
  it('a core read failing shows the load error, never zeros', async () => {
    for (const t of ['staff_profiles', 'programs', 'checklists', 'certification_ideas', 'tasks', 'task_assignees']) {
      const v = await loadLiveCertView(reader(base(), [t]).r, { id: 'u1', role: 'admin' }, NOW);
      expect(v.failed ? true : v.loadFailed, t).toBe(true);
    }
  });
  it('a chat failure marks only the chat', async () => {
    const v = await loadLiveCertView(reader(base(), ['chat_messages']).r, { id: 'u1', role: 'admin' }, NOW);
    if (v.failed) throw new Error('failed');
    expect(v.loadFailed).toBe(false);
    expect(v.chat.failed).toBe(true);
    expect(v.caps.chat).toBe(false);
    expect(v.steps).toHaveLength(2);
  });
  it('no program row is a load error; a person outside admin and board cannot post', async () => {
    const t = base();
    t.programs = [];
    const v = await loadLiveCertView(reader(t).r, { id: 'u1', role: 'admin' }, NOW);
    expect(v.failed ? true : v.loadFailed).toBe(true);
    const w = await loadLiveCertView(reader(base()).r, { id: 'u1', role: 'staff' }, NOW);
    expect(w.failed ? null : w.caps.chat).toBe(false);
  });
  it('marks the chat capped at the newest 40 messages, and a missing channel as no channel', async () => {
    const t = base();
    t.chat_messages = Array.from({ length: 45 }, (_, i) => ({ id: `m${i}`, author_id: 'u2', body: 'x', created_at: '2026-11-10T13:00:00Z' }));
    const v = await loadLiveCertView(reader(t).r, { id: 'u1', role: 'admin' }, NOW);
    expect(v.failed ? null : [v.chat.capped, v.chat.messages.length]).toEqual([true, 40]);
    const u = base();
    u.chat_channels = [];
    const w = await loadLiveCertView(reader(u).r, { id: 'u1', role: 'admin' }, NOW);
    expect(w.failed ? null : [w.chat.channelId, w.chat.failed, w.chat.capped, w.caps.chat]).toEqual([null, false, false, false]);
  });
  it('a missing program says so (noProgram), apart from a read error', async () => {
    const t = base();
    t.programs = [];
    const v = await loadLiveCertView(reader(t).r, { id: 'u1', role: 'admin' }, NOW);
    expect(v.failed ? null : [v.loadFailed, v.noProgram]).toEqual([true, true]);
    const e = await loadLiveCertView(reader(base(), ['programs']).r, { id: 'u1', role: 'admin' }, NOW);
    expect(e.failed ? null : [e.loadFailed, !!e.noProgram]).toEqual([true, false]);
  });
  it('reads assignees 100 task ids at a time', async () => {
    const t = base();
    t.tasks = Array.from({ length: 250 }, (_, i) => ({ id: `t${i}`, checklist_id: 'c1', title: `S${i}`, status: 'open', position: i }));
    const { r, calls } = reader(t);
    await loadLiveCertView(r, { id: 'u1', role: 'admin' }, NOW);
    const parts = calls.filter((c) => c.table === 'task_assignees').map((c) => (c.o.in?.task_id ?? []).length);
    expect(parts).toEqual([100, 100, 50]);
  });
});
