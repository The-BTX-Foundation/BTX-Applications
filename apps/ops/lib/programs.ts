// The Programs pages' loaders. Mock mode (no Supabase env) returns the Figma frames' sample data (mock/programs.ts,
// normal and stress). Live mode reads programs, certification_ideas, sponsorships, checklists + tasks and the Programs
// chat as the signed-in person. The pages and components only see CertData, SponsorshipsData and MentorData.
import { hasSupabaseEnv } from '@btx/data';
import { read } from './money-db';
import { loadAreaChat, loadStaff, checklistSteps, type LiveStep } from './area-db';
import { easternDay, type StaffMap } from './area-map';
import { mapCertPlan, mapCertSteps, mapIdeas, mapMentor, mapSponsorships, PROGRAM_STATUS } from './programs-map';
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

// A program's setup checklist: the first checklist owned by the program (its steps are tasks).
async function programChecklist(programId: string, staff: StaffMap): Promise<{ id?: string; steps: LiveStep[] }> {
  const lists = await read('checklists', 'id', { eq: { program_id: programId }, order: ['position', true], limit: 1 });
  if (lists.length === 0) return { steps: [] };
  const id = String(lists[0].id);
  return { id, steps: await checklistSteps(id, staff) };
}

/** Programs > Certifications: the plan numbers (programs), the setup checklist (checklists + tasks), the ideas and the chat. */
export async function loadCertifications(opts: { demo?: string } = {}): Promise<Loaded<CertData>> {
  if (opts.demo === 'error') return { failed: true };
  if (!hasSupabaseEnv()) return { ...(opts.demo === 'stress' ? MOCK_CERT_STRESS : MOCK_CERT), failed: false };
  try {
    const staff = await loadStaff();
    const prog = (await read('programs', 'id, status, summary, pilot_budget_cents, budget_period, students_target, cost_per_student_cents', { eq: { slug: 'certification' }, limit: 1 }))[0];
    if (!prog) return { failed: true };
    const programId = String(prog.id);
    const [list, ideaRows, chat] = await Promise.all([
      programChecklist(programId, staff),
      read('certification_ideas', 'id, name, decision, suggested_by, created_at', { eq: { program_id: programId }, order: ['created_at', true] }),
      loadAreaChat('programs', 'Programs chat', staff),
    ]);
    const ideas = mapIdeas(ideaRows, staff);
    const steps = mapCertSteps(list.steps);
    const next = steps.find((x) => x.state === 'next');
    const status = String(prog.status);
    return {
      programId,
      checklistId: list.id,
      subtitle: [PROGRAM_STATUS[status] ?? status, prog.summary].filter(Boolean).join(' · '),
      phoneSub: '',
      plan: mapCertPlan(prog, ideas, next?.due ? `Next step ${next.due}` : 'Not decided'),
      checklist: { done: steps.filter((x) => x.state === 'done').length, total: steps.length, nowLabel: next?.title ?? '', phoneNowLabel: next?.title ?? '', steps },
      ideas,
      chat,
      failed: false,
    };
  } catch {
    return { failed: true };
  }
}

/** Programs > Sponsorships: this year's rows from `sponsorships`. */
export async function loadSponsorships(opts: { demo?: string } = {}): Promise<Loaded<SponsorshipsData>> {
  if (opts.demo === 'error') return { failed: true };
  if (!hasSupabaseEnv()) return { ...(opts.demo === 'stress' ? MOCK_SPONSORSHIPS_STRESS : MOCK_SPONSORSHIPS), failed: false };
  try {
    const year = Number(easternDay(new Date()).slice(0, 4));
    const rows = await read('sponsorships', 'id, title, kind, students, amount_cents, when_label, occurred_on, status', { order: ['occurred_on', false] });
    return { ...MOCK_SPONSORSHIPS, year, rows: mapSponsorships(rows, year), failed: false };
  } catch {
    return { failed: true };
  }
}

/** Programs > Mentorship: the "Where it stands" checklist (checklists + tasks for the mentorship program). */
export async function loadMentorship(opts: { demo?: string } = {}): Promise<Loaded<MentorData>> {
  if (opts.demo === 'error') return { failed: true };
  if (!hasSupabaseEnv()) return { ...(opts.demo === 'stress' ? MOCK_MENTOR_STRESS : MOCK_MENTOR), failed: false };
  try {
    const staff = await loadStaff();
    const prog = (await read('programs', 'id, status', { eq: { slug: 'mentorship' }, limit: 1 }))[0];
    if (!prog) return { failed: true };
    const list = await programChecklist(String(prog.id), staff);
    return { ...mapMentor(prog, list.steps), failed: false };
  } catch {
    return { failed: true };
  }
}
