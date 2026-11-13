// Live Mentorship loading (lib/mentorship-live.ts) against a stand-in reader: a failed core read is the page's designed load
// error, a failed chat read fails only the chat, a missing program is "No steps yet", owners are read 100 ids at a time,
// and what the page may write follows the role.
import { describe, expect, it } from 'vitest';
import type { Row } from '@/lib/mentorship-map';
import { loadLiveMentorship, MS_ID_CHUNK, type MsReadOpts, type MsReader } from '@/lib/mentorship-live';

const NOW = new Date('2026-11-10T15:00:00Z');
const ADMIN = { id: 'me', initials: 'DM', role: 'admin' };

// A reader over in-memory tables; `fail` names tables whose read throws. Records every read.
function reader(tables: Record<string, Row[]>, fail: string[] = []) {
  const calls: { table: string; o: MsReadOpts }[] = [];
  const pick = (table: string, o: MsReadOpts = {}) => {
    calls.push({ table, o });
    if (fail.includes(table)) throw new Error('refused');
    let rows = tables[table] ?? [];
    for (const [c, v] of Object.entries(o.eq ?? {})) rows = rows.filter((r) => r[c] === v);
    for (const [c, v] of Object.entries(o.in ?? {})) rows = rows.filter((r) => v.includes(r[c]));
    return o.limit ? rows.slice(0, o.limit) : rows;
  };
  const r: MsReader = { rows: async (t, _s, o) => pick(t, o), all: async (t, _s, o) => pick(t, o) };
  return { r, calls };
}

const TASKS = Array.from({ length: 150 }, (_, i) => ({ id: `t${String(i).padStart(3, '0')}`, checklist_id: 'cl1', archived: false, title: `Step ${i}`, status: i < 2 ? 'done' : 'open', type: 'task', position: i, note: null, due_on: null, assignee_group: null }));
const TABLES: Record<string, Row[]> = {
  programs: [{ id: 'p1', slug: 'mentorship', status: 'planned' }],
  checklists: [{ id: 'cl1', program_id: 'p1' }],
  tasks: TASKS,
  task_assignees: [{ task_id: 't002', user_id: 'u2' }, { task_id: 't120', user_id: 'u2' }],
  staff_profiles: [{ user_id: 'me', display_name: 'Dana Mercer', initials: 'DM' }, { user_id: 'u2', display_name: 'Toby Faraday', initials: 'TF' }],
  chat_channels: [{ id: 'ch1', kind: 'area', area: 'programs' }],
  chat_messages: [{ id: 'x1', channel_id: 'ch1', author_id: 'u2', is_bot: false, body: 'Hi', created_at: '2026-11-10T14:00:00Z' }],
};

describe('loadLiveMentorship', () => {
  it('reads the steps, owners in chunks, the chat, and turns on the real writes for staff', async () => {
    const { r, calls } = reader(TABLES);
    const v = await loadLiveMentorship(r, ADMIN, NOW);
    expect(v.loadFailed).toBe(false);
    expect(v.status).toBe('Not active yet');
    expect(v.steps).toHaveLength(150);
    expect(v.steps[2].unassigned).toBe(false);
    expect(v.steps[3].unassigned).toBe(true);
    expect(v.steps[120].unassigned).toBe(false);
    const owners = calls.filter((c) => c.table === 'task_assignees');
    expect(owners).toHaveLength(2);
    expect(owners.every((c) => (c.o.in?.task_id ?? []).length <= MS_ID_CHUNK)).toBe(true);
    expect(calls.find((c) => c.table === 'tasks')?.o.eq).toEqual({ checklist_id: 'cl1', archived: false });
    expect(v.chat).toMatchObject({ failed: false, people: 2, channelId: 'ch1' });
    expect(v.caps).toEqual({ tick: true, undo: true, share: false, send: true });
    expect(v.today).toBe('2026-11-10');
  });
  it('a failed core read is the designed load error; the chat still loads', async () => {
    const { r } = reader(TABLES, ['tasks']);
    const v = await loadLiveMentorship(r, ADMIN, NOW);
    expect(v.loadFailed).toBe(true);
    expect(v.steps).toEqual([]);
    expect(v.caps.tick).toBe(false);
    expect(v.chat.failed).toBe(false);
  });
  it('a failed chat read fails only the chat', async () => {
    const { r } = reader(TABLES, ['chat_messages']);
    const v = await loadLiveMentorship(r, ADMIN, NOW);
    expect(v.loadFailed).toBe(false);
    expect(v.chat.failed).toBe(true);
    expect(v.caps.send).toBe(false);
  });
  it('a missing program or channel is empty, not an error', async () => {
    const { r } = reader({ ...TABLES, programs: [], chat_channels: [] });
    const v = await loadLiveMentorship(r, ADMIN, NOW);
    expect(v.loadFailed).toBe(false);
    expect(v.steps).toEqual([]);
    expect(v.chat).toMatchObject({ failed: false, channelId: null, messages: [] });
    expect(v.caps.send).toBe(false);
  });
  it('anyone but admins and board members gets no writes', async () => {
    const { r } = reader(TABLES);
    const v = await loadLiveMentorship(r, { ...ADMIN, role: 'staff' }, NOW);
    expect(v.caps).toEqual({ tick: false, undo: false, share: false, send: false });
  });
});
