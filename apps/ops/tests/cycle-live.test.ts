// The Cycle page in live mode (lib/cycle-live.ts) against a stand-in reader: each read's filters and unique order, ids
// sent 100 at a time, a failed read shown as its own load error (never a zero), one server log line with the table and
// code only, and the live caps (only the chat composer can write, and only for staff with a channel).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { liveCaps, loadLiveCycle, type CyReader, type CyReadOpts, type CyUser } from '@/lib/cycle-live';
import type { Row } from '@/lib/cycle-map';

const ME: CyUser = { id: 'u1', name: 'Dana Mercer', initials: 'DM', role: 'admin' };
const NOW = new Date('2026-11-10T14:14:00.000Z');

// A published cycle on the demo's dates.
const CYCLE = {
  id: 'c1',
  term: 'Fall 2026',
  award_name: 'Legacy Scholarship',
  award_amount_cents: 250000,
  opens_at: '2026-10-12T04:00:00.000Z',
  closes_at: '2026-11-07T04:59:00.000Z',
  interview_start: '2026-11-10',
  interview_end: '2026-11-20',
  decision_date: '2026-11-30',
  decisions_released_at: null,
  status: 'published',
};

type Call = { table: string; o: CyReadOpts & { limit?: number } };

// A stand-in reader over `tables`; `fail` makes one table's read throw (with row data in its message).
function reader(tables: Record<string, Row[]>, fail?: { table: string; code: string }) {
  const calls: Call[] = [];
  const read = async (table: string, _sel: string, o: CyReadOpts & { limit?: number }) => {
    calls.push({ table, o });
    if (fail?.table === table) throw { code: fail.code, message: 'Ada Okafor ada@example.com was refused' };
    let rows = tables[table] ?? [];
    for (const [k, v] of Object.entries(o.eq ?? {})) rows = rows.filter((r) => r[k] === v);
    for (const [k, v] of Object.entries(o.in ?? {})) rows = rows.filter((r) => v.includes(r[k]));
    return o.limit ? rows.slice(0, o.limit) : rows;
  };
  const r: CyReader = { rows: read, all: read };
  return { r, calls };
}

// 150 submitted applications: 60 booked (one twice), 30 with both scores published.
function tables(): Record<string, Row[]> {
  const apps = Array.from({ length: 150 }, (_, i) => ({ id: `a${String(i).padStart(3, '0')}`, cycle_id: 'c1', status: 'submitted' }));
  return {
    staff_profiles: [
      { user_id: 'u1', display_name: 'Dana Mercer', initials: 'DM' },
      { user_id: 'u2', display_name: 'Charlie Brooks', initials: 'CB' },
    ],
    chat_channels: [{ id: 'ch1', kind: 'area', area: 'scholarships' }],
    chat_messages: [{ id: 'm1', channel_id: 'ch1', author_id: 'u2', is_bot: false, body: 'Hello', created_at: '2026-11-10T13:00:00.000Z' }],
    cycles: [CYCLE],
    applications: [...apps, { id: 'zdraft', cycle_id: 'c1', status: 'draft' }, { id: 'zother', cycle_id: 'c0', status: 'submitted' }],
    bookings: [...apps.slice(0, 60).map((a, i) => ({ id: `b${i}`, application_id: a.id, status: 'active' })), { id: 'bx', application_id: 'a000', status: 'active' }, { id: 'by', application_id: 'a100', status: 'cancelled' }],
    application_score_summary: apps.map((a, i) => ({ application_id: a.id, published_count: i < 30 ? 2 : 1 })),
    checklists: [{ id: 'L1', title: 'Interviews', position: 1, cycle_id: 'c1' }],
    tasks: [
      { id: 't1', title: 'Book rooms', checklist_id: 'L1', position: 1, status: 'open', archived: false, due_on: '2026-11-12' },
      { id: 't2', title: 'Old step', checklist_id: 'L1', position: 2, status: 'open', archived: true },
    ],
    task_assignees: [{ task_id: 't1', user_id: 'u1' }],
  };
}

afterEach(() => vi.restoreAllMocks());

describe('loadLiveCycle', () => {
  it('reads filtered, uniquely ordered, chunked rows and counts from them', async () => {
    const { r, calls } = reader(tables());
    const v = await loadLiveCycle(r, ME, NOW);
    expect(v.loadFailed).toBe(false);
    expect(v.cycle).toMatchObject({ title: 'Fall 2026 cycle', applied: 150, booked: 60, scored: 30, interviewStart: '2026-11-10' });
    expect(v.rows.map((x) => x.id)).toEqual(['t1']);
    expect(v.chat).toMatchObject({ failed: false, channelId: 'ch1', people: 2 });
    // Every read ends its order on a unique key; bookings and scores go 100 ids at a time.
    for (const c of calls) expect(c.o.order.length).toBeGreaterThan(0);
    expect(calls.filter((c) => c.table === 'bookings').map((c) => c.o.in?.application_id.length)).toEqual([100, 50]);
    expect(calls.find((c) => c.table === 'cycles')?.o.eq).toEqual({ status: 'published' });
    expect(calls.find((c) => c.table === 'tasks')?.o.eq).toEqual({ archived: false });
    expect(calls.find((c) => c.table === 'chat_messages')?.o.order).toEqual([
      ['created_at', false],
      ['id', false],
    ]);
  });

  it('B14: open and closed come from the dates, not the status column', async () => {
    const { r } = reader(tables());
    const { stagesFor } = await import('@/lib/cycle-map');
    const open = await loadLiveCycle(r, ME, new Date('2026-10-20T14:00:00.000Z'));
    expect(stagesFor(open.cycle!, open.today, open.now)[0].state).toBe('now');
    const closed = await loadLiveCycle(r, ME, NOW);
    expect(stagesFor(closed.cycle!, closed.today, closed.now)[0].state).toBe('done');
  });

  it('a failed cycle read is the load error, logged with table and code only', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { r } = reader(tables(), { table: 'cycles', code: '42501' });
    const v = await loadLiveCycle(r, ME, NOW);
    expect(v).toMatchObject({ loadFailed: true, cycle: null });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('[cycle] read failed', { table: 'cycles', code: '42501' });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/Ada|example\.com/);
  });

  it('no published cycle is the empty page, not an error', async () => {
    const t = tables();
    t.cycles = [];
    const { r } = reader(t);
    expect(await loadLiveCycle(r, ME, NOW)).toMatchObject({ loadFailed: false, cycle: null });
  });

  it('a failed applications read leaves all three counts unread (null), never 0', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { r } = reader(tables(), { table: 'applications', code: 'PGRST301' });
    const v = await loadLiveCycle(r, ME, NOW);
    expect(v.cycle).toMatchObject({ applied: null, booked: null, scored: null });
  });

  it('a failed bookings read leaves only booked unread', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { r } = reader(tables(), { table: 'bookings', code: '57014' });
    const v = await loadLiveCycle(r, ME, NOW);
    expect(v.cycle).toMatchObject({ applied: 150, booked: null, scored: 30 });
  });

  it('a failed task read marks only the checklist', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { r } = reader(tables(), { table: 'task_assignees', code: '42501' });
    const v = await loadLiveCycle(r, ME, NOW);
    expect(v).toMatchObject({ loadFailed: false, listFailed: true, rows: [] });
    expect(v.chat.failed).toBe(false);
  });

  it('a failed chat read marks only the chat, and turns sending off', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { r } = reader(tables(), { table: 'chat_messages', code: '42501' });
    const v = await loadLiveCycle(r, ME, NOW);
    expect(v.chat.failed).toBe(true);
    expect(v.listFailed).toBe(false);
    expect(v.caps.send).toBe(false);
  });

  it('a failed people read never turns owners into "Board member": the checklist and chat show their load errors', async () => {
    const t = tables();
    t.task_assignees = [{ task_id: 't1', user_id: 'u2' }];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { r } = reader(t, { table: 'staff_profiles', code: '42501' });
    const v = await loadLiveCycle(r, ME, NOW);
    expect(v).toMatchObject({ listFailed: true, rows: [] });
    expect(v.chat.failed).toBe(true);
    expect(JSON.stringify(v.rows)).not.toContain('Board member');
    // With the names read, the owner is named.
    const ok = await loadLiveCycle(reader(t).r, ME, NOW);
    expect(ok.rows[0].owner).toMatchObject({ kind: 'person', label: 'Charlie Brooks' });
  });

  it('says the chat is capped only when the read returned the limit', async () => {
    const t = tables();
    expect((await loadLiveCycle(reader(t).r, ME, NOW)).chat).toMatchObject({ capped: false });
    t.chat_messages = Array.from({ length: 40 }, (_, i) => ({ id: `m${i}`, channel_id: 'ch1', author_id: 'u2', is_bot: false, body: 'Hi', created_at: '2026-11-10T13:00:00.000Z' }));
    expect((await loadLiveCycle(reader(t).r, ME, NOW)).chat).toMatchObject({ capped: true });
  });

  it('leaves declined tasks out of the live steps', async () => {
    const t = tables();
    t.tasks.push({ id: 't3', title: 'Order catering', checklist_id: 'L1', position: 3, status: 'declined', archived: false });
    const v = await loadLiveCycle(reader(t).r, ME, NOW);
    expect(v.rows.map((x) => x.id)).toEqual(['t1']);
  });
});

describe('liveCaps', () => {
  const chat = { failed: false as const, title: 'Scholarships chat', people: 2, messages: [], channelId: 'ch1' };
  it('never draws the demo writes live: no remind (emails students), share, tick or nudge', () => {
    for (const role of ['admin', 'board', 'applicant']) {
      const c = liveCaps({ ...ME, role }, chat);
      expect([c.remind, c.share, c.tick, c.nudge]).toEqual([false, false, false, false]);
    }
  });
  it('send only for admins and board members, only with a channel that loaded', () => {
    expect(liveCaps(ME, chat).send).toBe(true);
    expect(liveCaps({ ...ME, role: 'board' }, chat).send).toBe(true);
    expect(liveCaps({ ...ME, role: 'applicant' }, chat).send).toBe(false);
    expect(liveCaps(ME, { ...chat, channelId: null }).send).toBe(false);
    expect(liveCaps(ME, { failed: true, title: 'Scholarships chat' }).send).toBe(false);
  });
  it('the loaded page carries these caps', async () => {
    const { r } = reader(tables());
    const v = await loadLiveCycle(r, { ...ME, role: 'board' }, NOW);
    expect(v.caps).toEqual({ remind: false, share: false, tick: false, nudge: false, send: true });
  });
});
