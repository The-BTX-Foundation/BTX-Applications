// The cycle overview's pure logic (no database, no next/headers, so it is unit tested): the six phases and their states,
// the phone's "Now" and "Next" lines, and the checklist built from real tasks.
import { dateOnlyLabel, shortDate } from './format';
import type { OpsIconName } from '@/components/icons';
import type { ChecklistGroup, ChecklistRow } from '@/mock/cycle';

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
  /** Mock mode: the Figma sample. Live mode: the cycle's own checklists and tasks (empty when there are none). */
  checklist?: CycleChecklist;
  failed: boolean;
};

// An Eastern-time calendar date ("2026-08-17") from a timestamp.
export function easternIso(ts: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(ts));
}

// Works out each phase's state from its start and end ("2026-09-14" strings) and today.
export function phaseState(start: string | null, end: string | null, today: string): Phase['state'] {
  if (end && end < today) return 'done';
  if (start && start <= today) return 'now';
  return 'up';
}

// Builds the overview from the raw dates.
export function build(d: {
  title: string;
  award: string | null;
  status: string;
  applicants: number;
  open: string | null;
  close: string | null;
  iStart: string | null;
  iEnd: string | null;
  decision: string | null;
  /** The three dates the cycles table has no column for (null = "Not set"). */
  schedule: { scoresDue: string | null; selectionMeeting: string | null; fundsSent: string | null };
  today: string;
}): CycleOverview {
  const range = (a: string | null, b: string | null) => (a && b ? `${shortDate(a)} - ${shortDate(b)}` : 'Not set');
  const one = (a: string | null) => (a ? dateOnlyLabel(a) : 'Not set');
  const raw: { label: string; short: string; dates: string; start: string | null; end: string | null }[] = [
    { label: 'Applications', short: 'Apply', dates: range(d.open, d.close), start: d.open, end: d.close },
    { label: 'Interviews', short: 'Interview', dates: range(d.iStart, d.iEnd), start: d.iStart, end: d.iEnd },
    { label: 'Scores due', short: 'Scores', dates: one(d.schedule.scoresDue), start: d.iEnd, end: d.schedule.scoresDue },
    { label: 'Selection meeting', short: 'Select', dates: one(d.schedule.selectionMeeting), start: d.schedule.scoresDue, end: d.schedule.selectionMeeting },
    { label: 'Award announced', short: 'Award', dates: one(d.decision), start: d.schedule.selectionMeeting, end: d.decision },
    { label: 'Funds sent', short: 'Funds', dates: one(d.schedule.fundsSent), start: d.decision, end: d.schedule.fundsSent },
  ];
  // A phase that is finished means every phase before it is finished too (a missing date must not leave one behind).
  const states = raw.map((r) => phaseState(r.start, r.end, d.today));
  const lastDone = states.lastIndexOf('done');
  states.forEach((st, i) => {
    if (i < lastDone && st !== 'done') states[i] = 'done';
  });
  // The first phase that is not finished is "now" (only phases 1 and 2 show Done / Now words in the design).
  let nowSeen = false;
  const phases: Phase[] = raw.map((r, i) => {
    let state = states[i];
    if (state === 'now') {
      if (nowSeen) state = 'up';
      nowSeen = true;
    }
    return { n: i + 1, label: r.label, short: r.short, dates: r.dates, state };
  });
  const now = phases.find((p) => p.state === 'now');
  // The phone's two sentences: where the cycle is now (with the days left in that phase) and what follows.
  const nowRaw = raw[phases.findIndex((p) => p.state === 'now')];
  const left = nowRaw?.end ? Math.round((Date.parse(nowRaw.end) - Date.parse(d.today)) / 86_400_000) : null;
  const nowLine = now ? `Now: ${now.label.toLowerCase()}${nowRaw?.end ? `, to ${dateOnlyLabel(nowRaw.end)}` : ''}${left !== null && left >= 0 ? ` (${left} day${left === 1 ? '' : 's'} left)` : ''}` : 'Not started';
  // phases with no date are left out of the phone's "Next" line (it would read "scores due Not set")
  const after = phases.filter((p) => p.state === 'up' && p.dates !== 'Not set');
  // the phone's wording: "scores due", "selection meeting", "award", "funds sent"
  const word = (p: Phase) => (p.label === 'Award announced' ? 'award' : p.label.toLowerCase());
  const phrase = (p: Phase) => `${word(p)} ${p.dates}`;
  const nextLine = after.length ? `Next: ${after.slice(0, 4).map(phrase).join(', ')}` : '';
  return {
    phoneSub: `Scholarships · ${(d.award ?? 'Scholarship').replace(/ Scholarship$/, '')} · ${d.status} · ${d.applicants} applicants`,
    nowLine,
    nextLine,
    title: d.title,
    sub: `${d.award ?? 'Scholarship'} · ${d.status} · ${d.applicants} applicants`,
    phases,
    nowLabel: now?.label ?? 'Not started',
    failed: false,
  };
}


const ICON: Record<string, OpsIconName> = { task: 'tasks', request: 'calendar', approval: 'approval', post: 'outreach', scoring: 'scoring', meeting: 'meeting', decision: 'approval', document: 'file', goal: 'goals', follow_up: 'tasks' };
const KIND: Record<string, string> = { task: 'Task', request: 'Request', approval: 'Approval', post: 'Post', scoring: 'Scoring', meeting: 'Meeting', decision: 'Decision', document: 'Document', goal: 'Goal', follow_up: 'Follow-up' };
const GROUP_OWNER: Record<string, string> = { bot: 'BTX', board: 'Board', all_board: 'All board members', interview_pairs: 'Interview pairs' };

type R = Record<string, unknown>;

/** "2 days late", "Today" or "Tomorrow" for a due date, or nothing when it is further off. */
export function dueRel(due: string, today: string, done: boolean): ChecklistRow['rel'] | undefined {
  if (done) return undefined;
  const diff = Math.round((Date.parse(due) - Date.parse(today)) / 86_400_000);
  if (diff < 0) return { text: `${-diff} day${diff === -1 ? '' : 's'} late`, late: true };
  if (diff === 0) return { text: 'Today' };
  if (diff === 1) return { text: 'Tomorrow' };
  return undefined;
}

/** The cycle checklist from real rows: one group per checklist owned by the cycle, one row per task. */
export function buildChecklist(lists: R[], tasks: R[], assignees: R[], people: Map<string, { name: string; initials: string }>, today: string): CycleChecklist {
  let nowMarked = false;
  const groups: ChecklistGroup[] = lists.map((l) => {
    const mine = tasks.filter((t) => t.checklist_id === l.id);
    const rows: ChecklistRow[] = mine.map((t) => {
      const done = t.status === 'done';
      const due = t.due_on ? String(t.due_on) : undefined;
      const late = !!due && !done && due < today;
      const a = assignees.find((x) => x.task_id === t.id);
      const p = a ? people.get(String(a.user_id)) : undefined;
      const group = t.assignee_group ? GROUP_OWNER[String(t.assignee_group)] : undefined;
      const type = String(t.type ?? 'task');
      return {
        id: String(t.id),
        title: String(t.title),
        icon: ICON[type] ?? 'tasks',
        kind: KIND[type] ?? 'Task',
        sub: t.note ? String(t.note) : String(l.title),
        state: done ? 'done' : late ? 'late' : 'open',
        owner: p ? { kind: 'person', label: p.name, initials: p.initials } : group ? { kind: t.assignee_group === 'bot' ? 'bot' : 'group', label: group } : { kind: 'group', label: 'Unassigned' },
        due: due ? dateOnlyLabel(due) : undefined,
        rel: due ? dueRel(due, today, done) : undefined,
        status: done ? 'Done' : undefined,
      };
    });
    const open = rows.some((r) => r.state !== 'done');
    const now = open && !nowMarked;
    if (now) nowMarked = true;
    return { id: String(l.id), label: String(l.title), now, rows };
  });
  const all = groups.flatMap((g) => g.rows);
  return { done: all.filter((r) => r.state === 'done').length, total: all.length, groups };
}
