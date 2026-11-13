// The Grants page's live reads, as the signed-in person (the session client, so row-level security applies). Every read
// pages through the table 1,000 rows at a time in a stable order (PostgREST's per-request cap applies silently), so no
// list or count is ever cut short. Server side only.
import { whoAmI } from './daily-db';
import { pageAll, type Row } from './grants-map';
import { sessionClient } from './supabase-server';
import type { GrantsReader, GrantsReadOpts } from './grants-live';

type Res = { data: Row[] | null; error: unknown };
type Q = PromiseLike<Res> & {
  eq: (c: string, v: unknown) => Q;
  in: (c: string, v: unknown[]) => Q;
  order: (c: string, o: { ascending: boolean }) => Q;
  range: (from: number, to: number) => Q;
};
type Loose = { from: (t: string) => { select: (cols: string) => Q } };

// Every row matching the filters, read in pages ordered by `o.order` (its last column unique, so no row is skipped or read
// twice between pages). Throws when the database says no (the loader turns that into the load error).
async function readAll(table: string, select: string, o: GrantsReadOpts): Promise<Row[]> {
  const client = (await sessionClient()) as unknown as Loose;
  return pageAll(async (from, to) => {
    let q = client.from(table).select(select);
    for (const [c, v] of Object.entries(o.eq ?? {})) q = q.eq(c, v);
    for (const [c, v] of Object.entries(o.in ?? {})) q = q.in(c, v);
    for (const c of o.order) q = q.order(c, { ascending: true });
    const { data, error } = await q.range(from, to);
    if (error) throw error;
    return data ?? [];
  });
}

/** The reader live mode uses. */
export const sessionReader: GrantsReader = {
  all: readAll,
  me: async () => (await whoAmI())?.id ?? null,
};
