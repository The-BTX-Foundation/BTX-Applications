// Interviews > Your availability: the live reads on the server, as the signed-in person (the session client, so
// row-level security applies). `rows` is one request with a limit; `all` pages through a table 1,000 rows at a time in
// the caller's stable order, so nothing is silently cut at the database API's per-request cap. Server side only.
import type { AvReader, AvReadOpts, Row } from './availability-live';
import { sessionClient } from './supabase-server';

type Res = { data: Row[] | null; error: unknown };
type Q = PromiseLike<Res> & {
  eq: (c: string, v: unknown) => Q;
  order: (c: string, o: { ascending: boolean }) => Q;
  limit: (n: number) => Q;
  range: (from: number, to: number) => Q;
};
type Loose = { from: (t: string) => { select: (cols: string) => Q } };

/** Rows per page, and the most a paged read will gather before refusing a partial list. */
const PAGE = 1000;
const MAX_ROWS = 20_000;

// The query with its filters and sort applied (built, not run: a query is a thenable, so it is never awaited here).
function query(client: Loose, table: string, select: string, o: AvReadOpts): Q {
  let q = client.from(table).select(select);
  for (const [c, v] of Object.entries(o.eq ?? {})) q = q.eq(c, v);
  for (const [c, asc] of o.order ?? []) q = q.order(c, { ascending: asc });
  return q;
}

// One request; throws when the database says no.
async function rows(table: string, select: string, o: AvReadOpts = {}): Promise<Row[]> {
  let q = query((await sessionClient()) as unknown as Loose, table, select, o);
  if (o.limit) q = q.limit(o.limit);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// Every matching row, in pages; throws when the database says no or the list is too long to read whole.
async function all(table: string, select: string, o: AvReadOpts): Promise<Row[]> {
  const client = (await sessionClient()) as unknown as Loose;
  const out: Row[] = [];
  for (;;) {
    const { data, error } = await query(client, table, select, o).range(out.length, out.length + PAGE - 1);
    if (error) throw error;
    const page = data ?? [];
    if (page.length === 0) return out;
    if (out.length >= MAX_ROWS) throw new Error('too many rows');
    out.push(...page);
  }
}

/** The reader live mode uses. */
export const avSessionReader: AvReader = { rows, all };
