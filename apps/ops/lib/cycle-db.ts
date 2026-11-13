// The Cycle page's live reads on the server, as the signed-in person (the session client, so row-level security
// applies). `rows` is one request (a read with a small limit); `all` pages through a table 1,000 rows at a time in a
// stable order (the caller's last order column is unique), so nothing is silently cut at the database API's cap.
import { pageRows } from './mentorship-map';
import type { Row } from './cycle-map';
import type { CyReadOpts, CyReader } from './cycle-live';
import { sessionClient } from './supabase-server';

type Res = { data: Row[] | null; error: unknown };
type Q = PromiseLike<Res> & {
  eq: (c: string, v: unknown) => Q;
  in: (c: string, v: unknown[]) => Q;
  order: (c: string, o: { ascending: boolean }) => Q;
  limit: (n: number) => Q;
  range: (from: number, to: number) => Q;
};
type Loose = { from: (t: string) => { select: (cols: string) => Q } };

// The query with its filters and sort applied (built, not run).
function query(client: Loose, table: string, select: string, o: CyReadOpts): Q {
  let q = client.from(table).select(select);
  for (const [c, v] of Object.entries(o.eq ?? {})) q = q.eq(c, v);
  for (const [c, v] of Object.entries(o.in ?? {})) q = q.in(c, v);
  for (const [c, asc] of o.order) q = q.order(c, { ascending: asc });
  return q;
}

// One request with a limit; throws when the database says no.
async function rows(table: string, select: string, o: CyReadOpts & { limit: number }): Promise<Row[]> {
  const q = query((await sessionClient()) as unknown as Loose, table, select, o).limit(o.limit);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// Every matching row, in pages.
async function all(table: string, select: string, o: CyReadOpts): Promise<Row[]> {
  const client = (await sessionClient()) as unknown as Loose;
  return pageRows(async (from, to) => {
    const { data, error } = await query(client, table, select, o).range(from, to);
    if (error) throw error;
    return data ?? [];
  });
}

/** The reader live mode uses. */
export const cySessionReader: CyReader = { rows, all };
