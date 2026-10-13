// The Tasks page's data. Types mirror the draft Ops Hub schema (tasks, task_types, task_assignees, task_comments,
// checklists, staff_profiles; see supabase/migrations/20261010120000_ops_hub.sql in the ops-schema worktree).
// MOCK (mock/tasks.ts): everything, in mock mode. LIVE: every part is read from the tables (lib/daily-load.ts builds it
// with the pure functions in lib/daily-tasks.ts).
import { hasSupabaseEnv } from '@btx/data';
import { whoAmI } from './daily-db';
import { loadLiveTasks } from './daily-load';
import { MOCK_NOW } from '@/mock/applicants';
import { PEOPLE, SEEDS, STRESS_SEEDS, DONE, COUNTS, STRESS_COUNTS, COMMENTS, STRESS_COMMENTS } from '@/mock/tasks';

export * from './tasks-shared';
import { decorate, type TasksData } from './tasks-shared';

const AREAS = [
  { slug: 'scholarships', name: 'Scholarships' },
  { slug: 'money', name: 'Finance' },
  { slug: 'programs', name: 'Programs' },
  { slug: 'outreach', name: 'Outreach' },
];

const empty: TasksData = {
  failed: true,
  mode: 'mock',
  today: '',
  me: '',
  people: [],
  areas: [],
  tasks: [],
  comments: {},
  counts: { mine: 0, team: 0, approvals: 0, open: 0, done_week: 0 },
  done: [],
};

// Loads the page's data. `demo` is the ?demo= value: "error" returns the failed shape, "stress" the long-text sample.
export async function loadTasks({ demo }: { demo?: string } = {}): Promise<TasksData> {
  if (demo === 'error') return empty;
  const today = MOCK_NOW.slice(0, 10);
  const stress = demo === 'stress';
  const mock: TasksData = {
    failed: false,
    mode: 'mock',
    today,
    me: 'dm',
    people: PEOPLE,
    areas: AREAS,
    tasks: (stress ? STRESS_SEEDS : SEEDS).map((s) => decorate(s, today)),
    comments: stress ? STRESS_COMMENTS : COMMENTS,
    counts: stress ? STRESS_COUNTS : COUNTS,
    done: DONE,
  };
  if (!hasSupabaseEnv()) return mock;
  try {
    const who = await whoAmI();
    if (!who) return empty;
    const live = await loadLiveTasks(who.id);
    return { failed: false, mode: 'live', me: who.id, ...live };
  } catch {
    return empty;
  }
}
