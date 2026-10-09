// The Programs pages' loaders. MOCK in mock mode (mock/programs.ts, which has the Figma frames' data, normal and stress).
// Live mode reads the draft Ops Hub tables, marked NOT TESTED because the tables are not applied yet; the derived parts
// (checklist steps from tasks, the chat) still return the mock shape until the tables exist. Going live is a swap
// inside each loader; the pages and components only see CertData, SponsorshipsData and MentorData.
import { hasSupabaseEnv } from '@btx/data';
import { sessionClient } from './supabase-server';
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

// The draft tables are not in the generated database types yet, so the query builder is used untyped.
type Q = PromiseLike<{ data: unknown; error: unknown }> & {
  select: (c: string) => Q;
  eq: (c: string, v: unknown) => Q;
  order: (c: string, o?: { ascending: boolean }) => Q;
};
type Untyped = { from: (t: string) => Q };

const live = async () => (await sessionClient()) as unknown as Untyped;

/** Programs > Certifications: the plan numbers (programs), the setup checklist (checklists + tasks) and the ideas. */
export async function loadCertifications(opts: { demo?: string } = {}): Promise<Loaded<CertData>> {
  if (opts.demo === 'error') return { failed: true };
  if (!hasSupabaseEnv()) return { ...(opts.demo === 'stress' ? MOCK_CERT_STRESS : MOCK_CERT), failed: false };
  try {
    // NOT TESTED: needs the Ops Hub tables (draft schema, not applied).
    const c = await live();
    const prog = await c.from('programs').select('id, status, pilot_budget_cents, budget_period, students_target, cost_per_student_cents').eq('slug', 'certification');
    if (prog.error) throw prog.error;
    const ideas = await c.from('certification_ideas').select('id, name, decision, suggested_by, created_at').order('created_at');
    if (ideas.error) throw ideas.error;
    // TODO: the setup checklist is checklists (program_id) + tasks (checklist_id), and the chat is chat_messages in the
    // programs channel; until the tables exist those parts return the mock shape.
    const programId = ((prog.data ?? []) as { id?: string }[])[0]?.id;
    return { ...MOCK_CERT, programId, failed: false };
  } catch {
    return { failed: true };
  }
}

/** Programs > Sponsorships: this year's rows from `sponsorships`. */
export async function loadSponsorships(opts: { demo?: string } = {}): Promise<Loaded<SponsorshipsData>> {
  if (opts.demo === 'error') return { failed: true };
  if (!hasSupabaseEnv()) return { ...(opts.demo === 'stress' ? MOCK_SPONSORSHIPS_STRESS : MOCK_SPONSORSHIPS), failed: false };
  try {
    // NOT TESTED: needs the Ops Hub tables (draft schema, not applied).
    const c = await live();
    const year = new Date().getFullYear();
    const r = await c.from('sponsorships').select('id, title, kind, students, amount_cents, when_label, occurred_on, status').order('occurred_on', { ascending: false });
    if (r.error) throw r.error;
    const rows = ((r.data ?? []) as Record<string, unknown>[])
      .filter((x) => String(x.occurred_on ?? year).startsWith(String(year)) && x.status !== 'cancelled')
      .map((x) => {
        const kind = String(x.kind ?? 'conference') as SponsorshipsData['rows'][number]['kind'];
        const when = String(x.when_label ?? x.occurred_on ?? '');
        return {
          id: String(x.id),
          title: String(x.title),
          kind,
          students: Number(x.students ?? 0),
          amount: Math.round(Number(x.amount_cents ?? 0) / 100),
          when,
          state: x.status === 'planned' ? ('Not started' as const) : ('Done' as const),
          phoneWhen: `${when} · also on Budget`,
        };
      });
    return { ...MOCK_SPONSORSHIPS, year, rows, failed: false };
  } catch {
    return { failed: true };
  }
}

/** Programs > Mentorship: the "Where it stands" checklist (checklists + tasks for the mentorship program). */
export async function loadMentorship(opts: { demo?: string } = {}): Promise<Loaded<MentorData>> {
  if (opts.demo === 'error') return { failed: true };
  if (!hasSupabaseEnv()) return { ...(opts.demo === 'stress' ? MOCK_MENTOR_STRESS : MOCK_MENTOR), failed: false };
  try {
    // NOT TESTED: needs the Ops Hub tables (draft schema, not applied).
    const c = await live();
    const prog = await c.from('programs').select('id, status').eq('slug', 'mentorship');
    if (prog.error) throw prog.error;
    // TODO: the checklist is checklists (program_id) + tasks (checklist_id); mentor pairings have no table in the draft.
    return { ...MOCK_MENTOR, failed: false };
  } catch {
    return { failed: true };
  }
}
