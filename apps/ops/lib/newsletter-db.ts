// The Newsletter page's live reads on the server, as the signed-in person (the session client, so row-level security
// applies). `rows` is one request (for a read with a small limit); `all` pages through a table 1,000 rows at a time in a
// stable order, so nothing is silently cut at the database API's cap.
import { nlPaged, type Row } from './newsletter-map';
import type { NlReadOpts, NlReader } from './newsletter-live';
import { sessionClient } from './supabase-server';

type Res = { data: Row[] | null; error: unknown };
type Q = PromiseLike<Res> & {
  eq: (c: string, v: unknown) => Q;
  neq: (c: string, v: unknown) => Q;
  order: (c: string, o: { ascending: boolean; nullsFirst?: boolean }) => Q;
  limit: (n: number) => Q;
  range: (from: number, to: number) => Q;
};
type Loose = { from: (t: string) => { select: (cols: string) => Q } };

// The query with its filters and sort applied (built, not run: a query is a thenable, so it is never awaited here).
// Nulls sort last either way (an issue with no send day comes after the dated ones).
function query(client: Loose, table: string, select: string, o: NlReadOpts): Q {
  let q = client.from(table).select(select);
  for (const [c, v] of Object.entries(o.eq ?? {})) q = q.eq(c, v);
  for (const [c, v] of Object.entries(o.neq ?? {})) q = q.neq(c, v);
  for (const [c, asc] of o.order ?? []) q = q.order(c, { ascending: asc, nullsFirst: false });
  return q;
}

// One request; throws when the database says no.
async function rows(table: string, select: string, o: NlReadOpts = {}): Promise<Row[]> {
  let q = query((await sessionClient()) as unknown as Loose, table, select, o);
  if (o.limit) q = q.limit(o.limit);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// Every matching row, in pages (the caller's `order` ends in a unique column).
async function all(table: string, select: string, o: NlReadOpts): Promise<Row[]> {
  const client = (await sessionClient()) as unknown as Loose;
  return nlPaged(async (from, to) => {
    const { data, error } = await query(client, table, select, o).range(from, to);
    if (error) throw error;
    return data ?? [];
  });
}

/** The reader live mode uses. */
export const nlSessionReader: NlReader = { rows, all };
