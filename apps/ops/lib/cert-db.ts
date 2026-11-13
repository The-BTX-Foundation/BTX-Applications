// The Certifications page's live reads, as the signed-in person (the session client, so row-level security applies).
// Two kinds: `rows`, one request with a limit (the program row, the chat channel, the newest chat messages); and `all`,
// which pages through a table 1,000 rows at a time in a unique order (lib/calendar-paging.ts readAllPages: an empty page
// ends the read, 20 pages is the ceiling and then the read fails), so a list is never cut short without saying so.
import { readAllPages } from './calendar-paging';
import { sessionClient } from './supabase-server';
import type { CertReader, CertReadOpts } from './cert-live';

type Row = Record<string, unknown>;
type Res = { data: Row[] | null; error: unknown };
type Q = PromiseLike<Res> & {
  eq: (c: string, v: unknown) => Q;
  in: (c: string, v: unknown[]) => Q;
  order: (c: string, o: { ascending: boolean }) => Q;
  limit: (n: number) => Q;
  range: (from: number, to: number) => Q;
};
type Loose = { from: (t: string) => { select: (cols: string) => Q } };

// The query with the filters and the order applied (wrapped: awaiting a bare query would send it).
async function query(table: string, select: string, o: CertReadOpts): Promise<{ q: Q }> {
  const client = (await sessionClient()) as unknown as Loose;
  let q = client.from(table).select(select);
  for (const [c, v] of Object.entries(o.eq ?? {})) q = q.eq(c, v);
  for (const [c, v] of Object.entries(o.in ?? {})) q = q.in(c, v);
  for (const [c, asc] of o.order) q = q.order(c, { ascending: asc });
  return { q };
}

// One request (limited); throws when the database says no.
async function rows(table: string, select: string, o: CertReadOpts): Promise<Row[]> {
  let { q } = await query(table, select, o);
  if (o.limit) q = q.limit(o.limit);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// Every matching row, in pages; throws when the database says no or the ceiling is reached.
async function all(table: string, select: string, o: CertReadOpts): Promise<Row[]> {
  return readAllPages(table, async (from, to) => {
    const { data, error } = await (await query(table, select, o)).q.range(from, to);
    if (error) throw error;
    return data ?? [];
  });
}

/** The reader live mode uses. */
export const certSessionReader: CertReader = { rows, all };
