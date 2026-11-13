// The Mentorship loader in LIVE mode (Supabase env present, the session reader faked): every `demo` flag is ignored, so
// a URL can never switch a live page into the mock's failure states or its mock-only writes.
import { describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const TABLES = vi.hoisted<Record<string, Row[]>>(() => ({
  programs: [{ id: 'p1', slug: 'mentorship', status: 'active' }],
  checklists: [{ id: 'cl1', program_id: 'p1' }],
  tasks: [
    { id: 't1', checklist_id: 'cl1', archived: false, title: 'Live step', status: 'declined', type: 'task', position: 1 },
    { id: 't2', checklist_id: 'cl1', archived: false, title: 'Live step 2', status: 'done', type: 'task', position: 2 },
  ],
  task_assignees: [],
  staff_profiles: [{ user_id: 'me', display_name: 'Dana Mercer', initials: 'DM' }],
  chat_channels: [{ id: 'ch1', kind: 'area', area: 'programs' }],
  chat_messages: [],
}));

vi.mock('@btx/data', () => ({ hasSupabaseEnv: () => true, getBrowserClient: () => ({}) }));
vi.mock('@/lib/mentorship-db', () => {
  // A reader over TABLES, filtered by the read's `eq` (the loader's real reads, no database).
  const pick = async (t: string, _s: string, o: { eq?: Record<string, unknown>; limit?: number } = {}) => {
    let rows = TABLES[t] ?? [];
    for (const [c, v] of Object.entries(o.eq ?? {})) rows = rows.filter((r) => r[c] === v);
    return o.limit ? rows.slice(0, o.limit) : rows;
  };
  return { msSessionReader: { rows: pick, all: pick } };
});

import { loadMentorshipView } from '@/lib/mentorship-view-loader';

const USER = { id: 'me', initials: 'DM', role: 'admin' };

describe('loadMentorshipView, live', () => {
  it.each(['failed', 'error', 'chaterror', 'failsave', 'failsend', 'stress', 'empty'])('ignores ?demo=%s and reads the live tables', async (demo) => {
    const v = await loadMentorshipView({ demo, user: USER });
    expect(v.failed).toBe(false);
    if (v.failed) return;
    expect(v.loadFailed).toBe(false);
    expect(v.chat.failed).toBe(false);
    expect(v.failFirst).toBeUndefined();
    expect(v.caps.share).toBe(false);
    expect(v.checklistId).toBe('cl1');
    expect(v.steps.map((s) => [s.title, s.done, s.reopenAs])).toEqual([
      ['Live step', false, 'declined'],
      ['Live step 2', true, 'open'],
    ]);
  });
});
