// The Goals page's live reads, as the signed-in person (the session client, so row-level security applies). Two kinds:
// `rows`, one request (lib/daily-db.ts readRows), for reads that are small by nature; and `all`, which pages through a
// table 1,000 rows at a time (PostgREST's per-request cap, which it applies silently) so a sum is never an undercount.
import { readRows, type ReadOpts, type Row } from './daily-db';
import { pageAll } from './goals-map';
import { sessionClient } from './supabase-server';
import type { GoalsReader } from './goals-live';

type Res = { data: Row[] | null; error: unknown };
type Q = PromiseLike<Res> & {
  eq: (c: string, v: unknown) => Q;
  in: (c: string, v: unknown[]) => Q;
  gte: (c: string, v: string) => Q;
  lte: (c: string, v: string) => Q;
  order: (c: string, o: { ascending: boolean }) => Q;
  range: (from: number, to: number) => Q;
};
type Loose = { from: (t: string) => { select: (cols: string) => Q } };

// Every row matching the filters, read in pages in a stable order (by `o.order`'s unique column, id by default, so no row
// is skipped or read twice between pages).
async function readAll(table: string, select: string, o: ReadOpts = {}): Promise<Row[]> {
  const by = o.order?.[0] ?? 'id';
  const client = (await sessionClient()) as unknown as Loose;
  return pageAll(async (from, to) => {
    let q = client.from(table).select(select);
    for (const [c, v] of Object.entries(o.eq ?? {})) q = q.eq(c, v);
    for (const [c, v] of Object.entries(o.in ?? {})) q = q.in(c, v);
    for (const [c, v] of Object.entries(o.gte ?? {})) q = q.gte(c, v);
    for (const [c, v] of Object.entries(o.lte ?? {})) q = q.lte(c, v);
    const { data, error } = await q.order(by, { ascending: true }).range(from, to);
    if (error) throw error;
    return data ?? [];
  });
}

/** The reader live mode uses. */
export const sessionReader: GoalsReader = { rows: readRows, all: readAll };
