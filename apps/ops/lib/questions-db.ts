// The Interview questions page's live reads, as the signed-in person (the session client, so row-level security applies).
// Server side only. Every read that can grow pages 1,000 rows at a time in a unique order (PostgREST stops at 1,000 rows
// silently), stops on an empty page and fails past a ceiling instead of drawing a partial list (lib/calendar-paging.ts);
// id lists are read in chunks of 100. A failed read throws `{ table, code }` only.
import { chunks, readAllPages } from './calendar-paging';
import type { Row } from './questions-map';
import type { QnReader } from './questions-live';
import { sessionClient } from './supabase-server';

type Res = { data: Row[] | null; error: unknown };
type Q = PromiseLike<Res> & {
  eq: (c: string, v: unknown) => Q;
  gt: (c: string, v: string) => Q;
  in: (c: string, v: unknown[]) => Q;
  or: (f: string) => Q;
  order: (c: string, o: { ascending: boolean }) => Q;
  limit: (n: number) => Q;
  range: (from: number, to: number) => Q;
};
type Loose = { from: (t: string) => { select: (cols: string) => Q } };

const client = async () => (await sessionClient()) as unknown as Loose;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The data of one answer, or the read error thrown (table and code only).
const rowsOf = (table: string, { data, error }: Res): Row[] => {
  if (error) throw { table, code: String((error as { code?: unknown }).code ?? 'unknown') };
  return data ?? [];
};

// Every row of a query, paged (`build` returns the filtered, ordered query; the last order column is unique).
async function all(table: string, build: (c: Loose) => Q): Promise<Row[]> {
  const c = await client();
  try {
    return await readAllPages(table, async (from, to) => rowsOf(table, await build(c).range(from, to)));
  } catch (e) {
    // The page ceiling: still a load error, logged as this table.
    if (e && typeof e === 'object' && 'table' in e) throw e;
    throw { table, code: 'too_many_rows' };
  }
}

// Every row whose `col` is one of `ids`, read in chunks of 100 ids.
async function byIds(table: string, ids: string[], build: (c: Loose, chunk: string[]) => Q): Promise<Row[]> {
  const out: Row[] = [];
  for (const chunk of chunks(ids.filter((id) => UUID.test(id)))) out.push(...(await all(table, (c) => build(c, chunk))));
  return out;
}

/** The reader live mode uses. */
export const sessionQnReader: QnReader = {
  async cycle() {
    const c = await client();
    const rows = rowsOf('cycles', await c.from('cycles').select('id, term').eq('status', 'published').order('created_at', { ascending: false }).order('id', { ascending: true }).limit(1));
    return rows[0] ?? null;
  },
  rubric(cycleId) {
    return all('rubric_criteria', (c) => c.from('rubric_criteria').select('id, key, name, weight, position').eq('cycle_id', cycleId).order('position', { ascending: true }).order('id', { ascending: true }));
  },
  questions(cycleId) {
    return all('interview_questions', (c) =>
      c.from('interview_questions').select('id, criterion_key, position, text, created_at').eq('cycle_id', cycleId).order('position', { ascending: true }).order('created_at', { ascending: true }).order('id', { ascending: true }),
    );
  },
  async myPairings(cycleId, me, nowIso) {
    if (!UUID.test(me)) return [];
    return all('interview_pairings', (c) =>
      c
        .from('interview_pairings')
        .select('slot_id, interviewer_a, interviewer_b, interview_slots!inner(cycle_id, starts_at, ends_at)')
        .eq('interview_slots.cycle_id', cycleId)
        .gt('interview_slots.starts_at', nowIso)
        .or(`interviewer_a.eq.${me},interviewer_b.eq.${me}`)
        .order('slot_id', { ascending: true }),
    );
  },
  bookings(slotIds) {
    return byIds('bookings', slotIds, (c, chunk) => c.from('bookings').select('id, slot_id, application_id').eq('status', 'active').in('slot_id', chunk).order('id', { ascending: true }));
  },
  applications(ids) {
    return byIds('applications', ids, (c, chunk) => c.from('applications').select('id, applicant_code, full_name').in('id', chunk).order('id', { ascending: true }));
  },
  staff(ids) {
    return byIds('staff_profiles', ids, (c, chunk) => c.from('staff_profiles').select('user_id, display_name').in('user_id', chunk).order('user_id', { ascending: true }));
  },
};
