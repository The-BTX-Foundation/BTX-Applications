// Pure mapping from Programs rows to what the pages draw (unit tested; no database here).
import type { CertData, CertIdea, CertStep, MentorData, MentorStep, SponsorshipRow } from '@/mock/programs';
import type { Owner } from '@/mock/area';
import { dateOnlyLabel } from './format';
import { n, ownerDueLine, s, usd, type Row, type StaffMap } from './area-map';

export type StepIn = { id: string; title: string; note: string | null; due_on: string | null; done: boolean; owner: Owner };

export const PROGRAM_STATUS: Record<string, string> = { planned: 'Planned, not active yet', setting_up: 'Setting up', active: 'Active', paused: 'Paused', ended: 'Ended' };

/** The certification setup checklist: first open step is "next"; it offers "Add an idea" when it is about certifications. */
export function mapCertSteps(steps: StepIn[]): CertStep[] {
  const nextIdx = steps.findIndex((x) => !x.done);
  return steps.map((x, i) => {
    const owner: Owner = x.owner ?? (x.done ? null : 'unassigned');
    const state: CertStep['state'] = x.done ? 'done' : i === nextIdx ? 'next' : 'todo';
    return {
      id: x.id,
      title: x.title,
      sub: x.done ? '' : (x.note ?? 'Not started'),
      owner,
      due: x.due_on ? dateOnlyLabel(x.due_on) : undefined,
      dueNote: x.done ? 'Done' : undefined,
      state,
      action: state === 'next' && /certif|idea|pick/i.test(x.title) ? 'Add an idea' : undefined,
      phoneSub: x.done ? (x.due_on ? dateOnlyLabel(x.due_on) : 'Done') : ownerDueLine(owner, x.due_on),
    };
  });
}

/** The mentorship "Where it stands" steps. */
export function mapMentorSteps(steps: StepIn[]): MentorStep[] {
  return steps.map((x) => ({
    id: x.id,
    title: x.title,
    state: x.done ? ('done' as const) : ('todo' as const),
    status: x.done ? 'Done' : 'Not started',
    unassigned: !x.done && !x.owner,
    phoneSub: x.done ? 'Done' : ownerDueLine(x.owner, x.due_on, 'Not scheduled'),
    phonePill: x.done ? 'Done' : 'Not started',
  }));
}

export function mapMentor(program: Row | undefined, steps: StepIn[]): MentorData {
  const launchStep = steps.find((x) => /launch/i.test(x.title));
  const mapped = mapMentorSteps(steps);
  const done = mapped.filter((x) => x.state === 'done').length;
  const status = s(program?.status || 'planned');
  const launch = launchStep?.due_on ? { value: dateOnlyLabel(launchStep.due_on), note: 'Launch date' } : { value: 'To be set', note: 'Nothing is scheduled' };
  return {
    subtitle: `${PROGRAM_STATUS[status] ?? status}${launchStep?.due_on ? ` · launch ${dateOnlyLabel(launchStep.due_on)}` : ' · launch date to be set'}`,
    phoneSub: `Programs · ${(PROGRAM_STATUS[status] ?? status).toLowerCase().replace(' yet', '')}`,
    launch,
    done,
    total: mapped.length,
    nowLabel: mapped.find((x) => x.state !== 'done')?.title ?? '',
    steps: mapped,
  };
}

/** The certification plan numbers from the programs row. */
export function mapCertPlan(program: Row | undefined, ideas: CertIdea[], firstNote: string): CertData['plan'] {
  const budget = program?.pilot_budget_cents;
  const target = program?.students_target;
  const per = program?.cost_per_student_cents;
  const chosen = ideas.filter((i) => i.decision === 'chosen');
  const open = ideas.filter((i) => i.decision === 'not_decided').length;
  return {
    budget: budget == null ? 'Not set' : usd(budget),
    budgetNote: s(program?.budget_period) || 'Period not set',
    students: target == null ? 'Not set' : `up to ${n(target)}`,
    studentsNote: per == null ? 'Cost not set' : `About ${usd(per)} each`,
    first: chosen.length ? `${chosen.length} chosen` : 'To pick',
    firstNote,
    ideasNote: open ? `${open} not decided` : ideas.length ? 'All decided' : 'None yet',
  };
}

export function mapIdeas(rows: Row[], staff: StaffMap): CertIdea[] {
  return rows.map((r) => ({
    id: s(r.id),
    name: s(r.name),
    by: staff.get(s(r.suggested_by))?.name ?? 'Someone',
    decision: (['chosen', 'dropped'].includes(s(r.decision)) ? s(r.decision) : 'not_decided') as CertIdea['decision'],
  }));
}

/** This year's sponsorships (cancelled ones are left out). A date-only row counts for its year; no date counts for this year. */
export function mapSponsorships(rows: Row[], year: number): SponsorshipRow[] {
  return rows
    .filter((x) => s(x.occurred_on || year).startsWith(String(year)) && x.status !== 'cancelled')
    .map((x) => {
      const kind = (['conference', 'travel', 'fee', 'other'].includes(s(x.kind)) ? s(x.kind) : 'conference') as SponsorshipRow['kind'];
      const when = s(x.when_label) || (x.occurred_on ? dateOnlyLabel(s(x.occurred_on)) : 'Date not set');
      const planned = x.status === 'planned';
      return {
        id: s(x.id),
        title: s(x.title),
        kind,
        students: n(x.students),
        amount: Math.round(n(x.amount_cents) / 100),
        when,
        state: planned ? ('Not started' as const) : ('Done' as const),
        phoneWhen: planned ? when : `${when} · also on Budget`,
      };
    });
}
