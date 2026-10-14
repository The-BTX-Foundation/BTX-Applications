// The cycle overview's pure logic (no database, no Next.js imports, so it is unit tested in tests/cycle-build.test.ts):
// the six phases and their states from the cycle's dates (any of which may be missing, shown as "Not set"), the phone's
// "Now" and "Next" lines, and the cycle checklist built from checklist rows and their tasks.
import { dateOnlyLabel, shortDate } from './format';
import type { ChecklistGroup, ChecklistRow, Owner } from '@/mock/cycle';
import type { OpsIconName } from '@/components/icons';

export type Phase = { n: number; label: string; short: string; dates: string; state: 'done' | 'now' | 'up' };

export type CycleChecklist = { done: number; total: number; groups: ChecklistGroup[] };

export type CycleOverview = {
  title: string;
  sub: string;
  phases: Phase[];
  /** The label of the phase that is happening now ("Interviews"), for the checklist header. */
  nowLabel: string;
  /** Phone only: the sub line ("Scholarships · Legacy · open · 18 applicants"), "Now: ..." and "Next: ..." lines. */
  phoneSub: string;
  nowLine: string;
  nextLine: string;
  /** The cycle checklist (groups of steps); empty groups when the cycle has none. */
  checklist: CycleChecklist;
  failed: boolean;
};

export const NOT_SET = 'Not set';

/** Works out a phase's state from its start and end ("2026-09-14" strings, either may be missing) and today. */
export function phaseState(start: string | null, end: string | null, today: string): Phase['state'] {
  if (end && end < today) return 'done';
  if (start && start <= today) return 'now';
  return 'up';
}

/** The dates the overview is built from. Missing ones (null) show as "Not set". */
export type CycleDates = {
  open: string | null;
  close: string | null;
  iStart: string | null;
  iEnd: string | null;
  scoresDue: string | null;
  selection: string | null;
  decision: string | null;
  fundsSent: string | null;
};

type RawPhase = { label: string; short: string; dates: string; start: string | null; end: string | null };

/** The six phases with their states. Each phase starts when the one before it ends. */
export function buildPhases(d: CycleDates, today: string): { phases: Phase[]; raw: RawPhase[] } {
  const range = (a: string | null, b: string | null) => (a && b ? `${shortDate(a)} - ${shortDate(b)}` : NOT_SET);
  const one = (a: string | null) => (a ? dateOnlyLabel(a) : NOT_SET);
  const raw: RawPhase[] = [
    { label: 'Applications', short: 'Apply', dates: range(d.open, d.close), start: d.open, end: d.close },
    { label: 'Interviews', short: 'Interview', dates: range(d.iStart, d.iEnd), start: d.iStart, end: d.iEnd },
    { label: 'Scores due', short: 'Scores', dates: one(d.scoresDue), start: d.iEnd, end: d.scoresDue },
    { label: 'Selection meeting', short: 'Select', dates: one(d.selection), start: d.scoresDue, end: d.selection },
    { label: 'Award announced', short: 'Award', dates: one(d.decision), start: d.selection, end: d.decision },
    { label: 'Funds sent', short: 'Funds', dates: one(d.fundsSent), start: d.decision, end: d.fundsSent },
  ];
  const states = raw.map((r) => phaseState(r.start, r.end, today));
  // A phase with a missing date can't finish on its own: once a later phase is done, every earlier one is done too.
  const lastDone = states.lastIndexOf('done');
  for (let i = 0; i < lastDone; i++) states[i] = 'done';
  // Only the first unfinished phase that has started is "now".
  let nowSeen = false;
  const phases: Phase[] = raw.map((r, i) => {
    let state = states[i];
    if (state === 'now') {
      if (nowSeen) state = 'up';
      nowSeen = true;
    }
    return { n: i + 1, label: r.label, short: r.short, dates: r.dates, state };
  });
  return { phases, raw };
}

/** Builds the overview (without the checklist) from the cycle's facts and dates. */
export function buildCycle(
  d: CycleDates & { title: string; award: string | null; status: string; applicants: number; today: string },
  checklist: CycleChecklist,
): CycleOverview {
  const { phases, raw } = buildPhases(d, d.today);
  const nowIdx = phases.findIndex((p) => p.state === 'now');
  const now = phases[nowIdx];
  // The phone's two sentences: where the cycle is now (with the days left in that phase) and what follows.
  const nowRaw = raw[nowIdx];
  const left = nowRaw?.end ? Math.round((Date.parse(nowRaw.end) - Date.parse(d.today)) / 86_400_000) : null;
  const nowLine = now
    ? `Now: ${now.label.toLowerCase()}${nowRaw?.end ? `, to ${dateOnlyLabel(nowRaw.end)}` : ''}${left !== null && left >= 0 ? ` (${left} day${left === 1 ? '' : 's'} left)` : ''}`
    : 'Not started';
  const after = phases.filter((p) => p.state === 'up');
  // the phone's wording: "scores due", "selection meeting", "award", "funds sent"
  const word = (p: Phase) => (p.label === 'Award announced' ? 'award' : p.label.toLowerCase());
  const phrase = (p: Phase) => `${word(p)} ${p.dates === NOT_SET ? 'not set' : p.dates}`;
  const nextLine = after.length ? `Next: ${after.slice(0, 4).map(phrase).join(', ')}` : '';
  const applicants = `${d.applicants} applicant${d.applicants === 1 ? '' : 's'}`;
  return {
    phoneSub: `Scholarships · ${(d.award ?? 'Scholarship').replace(/ Scholarship$/, '')} · ${d.status} · ${applicants}`,
    nowLine,
    nextLine,
    title: d.title,
    sub: `${d.award ?? 'Scholarship'} · ${d.status} · ${applicants}`,
    phases,
    nowLabel: now?.label ?? 'Not started',
    checklist,
    failed: false,
  };
}

// ---------- the cycle checklist ----------

export type ChecklistIn = { id: string; title: string; position: number };
export type TaskIn = {
  id: string;
  checklistId: string | null;
  title: string;
  type: string;
  status: string;
  dueOn: string | null;
  note: string | null;
  group: string | null;
  position: number;
  /** The task's owners (task_assignees joined to staff_profiles). */
  people: { name: string; initials: string }[];
};

const TYPE_LABEL: Record<string, string> = {
  task: 'Task',
  request: 'Request',
  approval: 'Approval',
  post: 'Post',
  scoring: 'Scoring',
  meeting: 'Meeting',
  decision: 'Decision',
  document: 'Document',
  goal: 'Goal',
  follow_up: 'Follow-up',
};
const TYPE_ICON: Record<string, OpsIconName> = { scoring: 'scoring', meeting: 'meeting', request: 'calendar', approval: 'approval' };
const GROUP_OWNER: Record<string, Owner> = {
  bot: { kind: 'bot', label: 'BTX' },
  board: { kind: 'group', label: 'Board' },
  all_board: { kind: 'group', label: 'All board members' },
  interview_pairs: { kind: 'group', label: 'Interview pairs' },
};

const days = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);

/** One task as a checklist row: late when its due date has passed and it isn't done. */
export function checklistRow(t: TaskIn, groupLabel: string, today: string): ChecklistRow {
  const finished = t.status === 'done' || t.status === 'declined';
  const late = !finished && !!t.dueOn && t.dueOn < today;
  const owner: Owner = (t.group && GROUP_OWNER[t.group]) || (t.people[0]
    ? { kind: 'person', label: t.people.length > 1 ? `${t.people[0].name} +${t.people.length - 1}` : t.people[0].name, initials: t.people[0].initials }
    : { kind: 'person', label: 'Unassigned', initials: '?' });
  let rel: ChecklistRow['rel'];
  if (late && t.dueOn) {
    const n = days(today, t.dueOn);
    rel = { text: `${n} day${n === 1 ? '' : 's'} late`, late: true };
  } else if (!finished && t.dueOn) {
    const n = days(t.dueOn, today);
    if (n === 0) rel = { text: 'Today' };
    else if (n === 1) rel = { text: 'Tomorrow' };
  }
  return {
    id: t.id,
    title: t.title,
    icon: TYPE_ICON[t.type] ?? 'tasks',
    kind: TYPE_LABEL[t.type] ?? 'Task',
    sub: t.note ?? groupLabel,
    state: finished ? 'done' : late ? 'late' : 'open',
    owner,
    due: t.dueOn ? dateOnlyLabel(t.dueOn) : undefined,
    rel,
    status: t.status === 'done' ? 'Done' : t.status === 'declined' ? 'Declined' : undefined,
  };
}

/** The cycle's checklists as groups (one per checklist, in order); a group whose steps are all done folds away. */
export function buildChecklist(lists: ChecklistIn[], tasks: TaskIn[], today: string): CycleChecklist {
  const ordered = [...lists].sort((a, b) => a.position - b.position);
  let nowGiven = false;
  let done = 0;
  let total = 0;
  const groups: ChecklistGroup[] = ordered.map((l) => {
    const mine = tasks.filter((t) => t.checklistId === l.id).sort((a, b) => a.position - b.position);
    const rows = mine.map((t) => checklistRow(t, l.title, today));
    const finished = rows.filter((r) => r.state === 'done').length;
    done += finished;
    total += rows.length;
    if (rows.length > 0 && finished === rows.length) {
      return { id: l.id, label: l.title, fold: { note: `${rows.length} step${rows.length === 1 ? '' : 's'} done`, steps: rows.map((r) => r.title) }, rows: [] };
    }
    const now = !nowGiven && rows.length > 0;
    if (now) nowGiven = true;
    return { id: l.id, label: l.title, now, rows };
  });
  return { done, total, groups };
}
