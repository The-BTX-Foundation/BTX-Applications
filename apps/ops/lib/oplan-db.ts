// The Outreach Plan page's live reads, as the signed-in person (the session client, so row-level security applies). Every
// read pages through its table 1,000 rows at a time in a unique order (lib/calendar-paging.ts readAllPages: an empty page
// ends the read, 20 pages is the ceiling and then the read fails), so a list is never cut short without saying so.
import { readAllPages } from './calendar-paging';
import { sessionClient } from './supabase-server';
import type { PnReader, PnReadOpts } from './oplan-live';

type Row = Record<string, unknown>;
type Res = { data: Row[] | null; error: unknown };
type Q = PromiseLike<Res> & {
  eq: (c: string, v: unknown) => Q;
  neq: (c: string, v: unknown) => Q;
  in: (c: string, v: unknown[]) => Q;
  gte: (c: string, v: unknown) => Q;
  lt: (c: string, v: unknown) => Q;
  is: (c: string, v: null) => Q;
  order: (c: string, o: { ascending: boolean }) => Q;
  range: (from: number, to: number) => Q;
};
type Loose = { from: (t: string) => { select: (cols: string) => Q } };

// The query with the filters and the order applied (wrapped: awaiting a bare query would send it).
async function query(table: string, select: string, o: PnReadOpts): Promise<{ q: Q }> {
  const client = (await sessionClient()) as unknown as Loose;
  let q = client.from(table).select(select);
  for (const [c, v] of Object.entries(o.eq ?? {})) q = q.eq(c, v);
  for (const [c, v] of Object.entries(o.neq ?? {})) q = q.neq(c, v);
  for (const [c, v] of Object.entries(o.in ?? {})) q = q.in(c, v);
  for (const [c, v] of Object.entries(o.gte ?? {})) q = q.gte(c, v);
  for (const [c, v] of Object.entries(o.lt ?? {})) q = q.lt(c, v);
  for (const c of o.isNull ?? []) q = q.is(c, null);
  for (const [c, asc] of o.order) q = q.order(c, { ascending: asc });
  return { q };
}

// Every matching row, in pages; throws when the database says no or the ceiling is reached.
async function all(table: string, select: string, o: PnReadOpts): Promise<Row[]> {
  return readAllPages(table, async (from, to) => {
    const { data, error } = await (await query(table, select, o)).q.range(from, to);
    if (error) throw error;
    return data ?? [];
  });
}

/** The reader live mode uses. */
export const oplanSessionReader: PnReader = { all };
