// The Programs pages' loaders. MOCK in mock mode (mock/programs.ts, which has the Figma frames' data, normal and stress).
// Live mode reads the Ops Hub tables as the signed-in person: `programs`, the program's checklist (`checklists` with
// program_id, its steps are `tasks`), `certification_ideas` and `sponsorships`. The mapping to the page shapes is pure
// (lib/programs-map.ts). The Programs chat beside Certifications is still the sample thread (components/area/area-chat).
import { hasSupabaseEnv } from '@btx/data';
import { sessionClient } from './supabase-server';
import { certData, mentorData, sponsorshipRow, sponsorshipsOfYear, type ProgramRow, type StepIn } from './programs-map';
import {
  MOCK_CERT,
  MOCK_CERT_STRESS,
  MOCK_MENTOR,
  MOCK_MENTOR_STRESS,
  MOCK_SPONSORSHIPS,
  MOCK_SPONSORSHIPS_STRESS,
  type CertData,
  type MentorData,
  type SponsorshipsData,
} from '@/mock/programs';

export type Loaded<T> = (T & { failed: false }) | { failed: true };

// The Ops Hub tables are not in the generated database types yet, so the query builder is used untyped.
type Q = PromiseLike<{ data: unknown; error: unknown }> & {
  select: (c: string) => Q;
  eq: (c: string, v: unknown) => Q;
  in: (c: string, v: unknown[]) => Q;
  order: (c: string, o?: { ascending: boolean }) => Q;
  limit: (n: number) => Q;
};
type Untyped = { from: (t: string) => Q };
type Row = Record<string, unknown>;

const live = async () => (await sessionClient()) as unknown as Untyped;
const num = (v: unknown) => (v == null ? null : Number(v));

// The program row of a slug.
async function programOf(c: Untyped, slug: string): Promise<ProgramRow | null> {
  const r = await c.from('programs').select('id, status, summary, pilot_budget_cents, budget_period, students_target, cost_per_student_cents').eq('slug', slug).limit(1);
  if (r.error) throw r.error;
  const x = ((r.data ?? []) as Row[])[0];
  if (!x) return null;
  return {
    id: String(x.id),
    status: String(x.status),
    summary: (x.summary as string | null) ?? null,
    pilotBudgetCents: num(x.pilot_budget_cents),
    budgetPeriod: (x.budget_period as string | null) ?? null,
    studentsTarget: num(x.students_target),
    costPerStudentCents: num(x.cost_per_student_cents),
  };
}

// The program's first checklist and its steps (tasks with their owners).
async function checklistOf(c: Untyped, programId: string): Promise<{ checklistId?: string; steps: StepIn[] }> {
  const l = await c.from('checklists').select('id').eq('program_id', programId).order('position').order('created_at').limit(1);
  if (l.error) throw l.error;
  const checklistId = ((l.data ?? []) as Row[])[0]?.id as string | undefined;
  if (!checklistId) return { steps: [] };
  const t = await c
    .from('tasks')
    .select('id, title, status, due_on, note, assignee_group, position, archived, task_assignees(user_id, staff_profiles!task_assignees_user_id_fkey(display_name, initials))')
    .eq('checklist_id', checklistId)
    .order('position');
  if (t.error) throw t.error;
  const steps = ((t.data ?? []) as Row[])
    .filter((x) => !x.archived)
    .map((x) => ({
      id: String(x.id),
      title: String(x.title),
      status: String(x.status),
      dueOn: (x.due_on as string | null) ?? null,
      note: (x.note as string | null) ?? null,
      group: (x.assignee_group as string | null) ?? null,
      position: Number(x.position ?? 0),
      people: ((x.task_assignees ?? []) as { user_id: string; staff_profiles: { display_name: string; initials: string } | null }[])
        .filter((a) => a.staff_profiles)
        .map((a) => ({ id: a.user_id, name: a.staff_profiles!.display_name, initials: a.staff_profiles!.initials })),
    }));
  return { checklistId: String(checklistId), steps };
}

/** Programs > Certifications: the plan numbers (programs), the setup checklist (checklists + tasks) and the ideas. */
export async function loadCertifications(opts: { demo?: string } = {}): Promise<Loaded<CertData>> {
  if (opts.demo === 'error') return { failed: true };
  if (!hasSupabaseEnv()) return { ...(opts.demo === 'stress' ? MOCK_CERT_STRESS : MOCK_CERT), failed: false };
  try {
    const c = await live();
    const prog = await programOf(c, 'certification');
    if (!prog) return { failed: true };
    const { checklistId, steps } = await checklistOf(c, prog.id);
    const ideas = await c
      .from('certification_ideas')
      .select('id, name, decision, staff_profiles!certification_ideas_suggested_by_fkey(display_name)')
      .eq('program_id', prog.id)
      .order('created_at');
    if (ideas.error) throw ideas.error;
    const ideaRows = ((ideas.data ?? []) as Row[]).map((x) => ({
      id: String(x.id),
      name: String(x.name),
      decision: String(x.decision),
      by: (x.staff_profiles as { display_name?: string } | null)?.display_name ?? null,
    }));
    return { ...certData(prog, steps, ideaRows, checklistId, MOCK_CERT.chat), failed: false };
  } catch {
    return { failed: true };
  }
}

/** Programs > Sponsorships: this year's rows from `sponsorships`. */
export async function loadSponsorships(opts: { demo?: string } = {}): Promise<Loaded<SponsorshipsData>> {
  if (opts.demo === 'error') return { failed: true };
  if (!hasSupabaseEnv()) return { ...(opts.demo === 'stress' ? MOCK_SPONSORSHIPS_STRESS : MOCK_SPONSORSHIPS), failed: false };
  try {
    const c = await live();
    const year = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric' }).format(new Date()));
    const r = await c.from('sponsorships').select('id, title, kind, students, amount_cents, when_label, occurred_on, status').order('occurred_on');
    if (r.error) throw r.error;
    const all = ((r.data ?? []) as Row[]).map((x) => ({
      id: String(x.id),
      title: String(x.title),
      kind: String(x.kind ?? 'conference'),
      students: num(x.students),
      amountCents: Number(x.amount_cents ?? 0),
      whenLabel: (x.when_label as string | null) ?? null,
      occurredOn: (x.occurred_on as string | null) ?? null,
      status: String(x.status),
    }));
    // The note and the "How a sponsorship works" steps are the page's fixed text.
    return { ...MOCK_SPONSORSHIPS, year, rows: sponsorshipsOfYear(all, year).map(sponsorshipRow), failed: false };
  } catch {
    return { failed: true };
  }
}

/** Programs > Mentorship: the "Where it stands" checklist (checklists + tasks for the mentorship program). */
export async function loadMentorship(opts: { demo?: string } = {}): Promise<Loaded<MentorData>> {
  if (opts.demo === 'error') return { failed: true };
  if (!hasSupabaseEnv()) return { ...(opts.demo === 'stress' ? MOCK_MENTOR_STRESS : MOCK_MENTOR), failed: false };
  try {
    const c = await live();
    const prog = await programOf(c, 'mentorship');
    if (!prog) return { failed: true };
    // Mentor pairings stay out of the page (O14).
    const { steps } = await checklistOf(c, prog.id);
    return { ...mentorData(prog, steps), failed: false };
  } catch {
    return { failed: true };
  }
}
