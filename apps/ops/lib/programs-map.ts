// The Programs pages' pure mapping (no database, no Next.js imports; unit tested in tests/programs-map.test.ts): the
// `programs` row, its checklist steps (`tasks`), the certification ideas and the sponsorships, turned into the shapes the
// page components draw (CertData, MentorData, SponsorshipsData).
import { dateOnlyLabel } from './format';
import type { Owner, Person } from '@/mock/area';
import type { CertData, CertIdea, CertStep, MentorData, MentorStep, SponsorshipRow } from '@/mock/programs';

export type ProgramRow = {
  id: string;
  status: string;
  summary: string | null;
  pilotBudgetCents: number | null;
  budgetPeriod: string | null;
  studentsTarget: number | null;
  costPerStudentCents: number | null;
};

/** A checklist step as read from `tasks` (owners from task_assignees + staff_profiles). */
export type StepIn = {
  id: string;
  title: string;
  status: string;
  dueOn: string | null;
  note: string | null;
  group: string | null;
  position: number;
  people: Person[];
};

const STATUS_WORD: Record<string, string> = { planned: 'Planned', setting_up: 'Setting up', active: 'Active', paused: 'Paused', ended: 'Ended' };
const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;
const isDone = (s: StepIn) => s.status === 'done';
const GROUP_NAME: Record<string, string> = { bot: 'BTX', board: 'Board', all_board: 'All board members', interview_pairs: 'Interview pairs' };

/** A step's owner chip: its first person, a group name, or "Unassigned". */
export function stepOwner(s: StepIn): Owner {
  if (s.people[0]) return s.people[0];
  if (s.group && GROUP_NAME[s.group]) return { name: GROUP_NAME[s.group], initials: GROUP_NAME[s.group].slice(0, 2).toUpperCase() };
  return 'unassigned';
}

const ownerName = (o: Owner) => (o === 'unassigned' ? 'Unassigned' : o ? o.name : '');

/** The certification program's setup checklist: done, the next open step (with "Add an idea" while no idea is chosen), then the rest. */
export function certSteps(steps: StepIn[], ideasChosen: boolean): CertStep[] {
  const ordered = [...steps].sort((a, b) => a.position - b.position);
  const next = ordered.findIndex((s) => !isDone(s));
  return ordered.map((s, i) => {
    const owner = isDone(s) ? null : stepOwner(s);
    const due = s.dueOn ? dateOnlyLabel(s.dueOn) : undefined;
    const state: CertStep['state'] = isDone(s) ? 'done' : i === next ? 'next' : 'todo';
    return {
      id: s.id,
      title: s.title,
      sub: isDone(s) ? '' : s.note ?? (s.status === 'in_progress' ? 'In progress' : 'Not started'),
      owner,
      due,
      dueNote: isDone(s) ? 'Done' : undefined,
      state,
      action: state === 'next' && !ideasChosen ? 'Add an idea' : undefined,
      phoneSub: [ownerName(owner), due].filter(Boolean).join(' · ') || (isDone(s) ? 'Done' : 'Not scheduled'),
    };
  });
}

/** Programs > Certifications from its rows. */
export function certData(p: ProgramRow, steps: StepIn[], ideas: { id: string; name: string; by: string | null; decision: string }[], checklistId: string | undefined, chat: CertData['chat']): CertData {
  const chosen = ideas.filter((i) => i.decision === 'chosen');
  const list = certSteps(steps, chosen.length > 0);
  const done = list.filter((s) => s.state === 'done').length;
  const next = list.find((s) => s.state === 'next');
  const status = STATUS_WORD[p.status] ?? p.status;
  return {
    programId: p.id,
    checklistId,
    subtitle: p.summary ? `${status} · ${p.summary}` : status,
    phoneSub: `Programs · ${status.toLowerCase()} · ${done} of ${list.length} steps`,
    plan: {
      budget: p.pilotBudgetCents != null ? money(p.pilotBudgetCents) : 'Not set',
      budgetNote: p.budgetPeriod ?? 'No period yet',
      students: p.studentsTarget != null ? `up to ${p.studentsTarget}` : 'Not set',
      studentsNote: p.costPerStudentCents != null ? `About ${money(p.costPerStudentCents)} each` : 'No cost yet',
      first: chosen.length ? `${chosen.length} chosen` : 'To pick',
      firstNote: chosen.length ? chosen.map((i) => i.name).join(', ') : next?.due ? `Due ${next.due}` : 'Not scheduled',
      ideasNote: chosen.length ? `${ideas.length - chosen.length} not decided` : 'Not decided',
    },
    checklist: { done, total: list.length, nowLabel: next?.title ?? '', phoneNowLabel: next?.title ?? '', steps: list },
    ideas: ideas.map((i): CertIdea => ({ id: i.id, name: i.name, by: i.by ?? 'Someone', decision: i.decision === 'chosen' || i.decision === 'dropped' ? i.decision : 'not_decided' })),
    chat,
  };
}

/** The mentorship program's "Where it stands" steps. "Share the application" sits on the recruiting step (not connected yet). */
export function mentorSteps(steps: StepIn[]): MentorStep[] {
  return [...steps]
    .sort((a, b) => a.position - b.position)
    .map((s) => {
      const done = isDone(s);
      const due = s.dueOn ? dateOnlyLabel(s.dueOn) : null;
      const share = !done && /recruit mentors/i.test(s.title);
      return {
        id: s.id,
        title: s.title,
        state: done ? 'done' : 'todo',
        status: share ? undefined : done ? 'Done' : s.status === 'in_progress' ? 'In progress' : 'Not started',
        action: share ? 'Share the application' : undefined,
        phoneSub: done ? 'Done' : due ?? 'Not scheduled',
        phonePill: share ? undefined : done ? 'Done' : 'Not started',
      };
    });
}

/** Programs > Mentorship from its rows. */
export function mentorData(p: { status: string; summary: string | null }, steps: StepIn[]): MentorData {
  const list = mentorSteps(steps);
  const done = list.filter((s) => s.state === 'done').length;
  const planned = p.status === 'planned' || p.status === 'setting_up';
  return {
    subtitle: planned ? 'Planned, not active yet · launch date to be set' : STATUS_WORD[p.status] ?? p.status,
    phoneSub: planned ? 'Programs · planned, not active' : `Programs · ${(STATUS_WORD[p.status] ?? p.status).toLowerCase()}`,
    launch: { value: 'To be set', note: 'Nothing is scheduled' },
    done,
    total: list.length,
    nowLabel: list.find((s) => s.state !== 'done')?.title ?? '',
    steps: list,
  };
}

/** One `sponsorships` row as a page row. */
export function sponsorshipRow(x: { id: string; title: string; kind: string; students: number | null; amountCents: number; whenLabel: string | null; occurredOn: string | null; status: string }): SponsorshipRow {
  const kind = (['conference', 'travel', 'fee', 'other'].includes(x.kind) ? x.kind : 'other') as SponsorshipRow['kind'];
  const when = x.whenLabel || (x.occurredOn ? dateOnlyLabel(x.occurredOn) : 'Date not set');
  return {
    id: x.id,
    title: x.title,
    kind,
    students: x.students ?? 0,
    amount: Math.round(x.amountCents / 100),
    when,
    state: x.status === 'planned' ? 'Not started' : 'Done',
    phoneWhen: `${when} · also on Budget`,
  };
}

/** This year's sponsorships, oldest first; cancelled ones and other years left out (no date counts as this year). */
export function sponsorshipsOfYear<T extends { occurredOn: string | null; status: string }>(rows: T[], year: number): T[] {
  return rows
    .filter((x) => x.status !== 'cancelled' && (x.occurredOn ?? String(year)).startsWith(String(year)))
    .sort((a, b) => (a.occurredOn ?? '9999').localeCompare(b.occurredOn ?? '9999'));
}
