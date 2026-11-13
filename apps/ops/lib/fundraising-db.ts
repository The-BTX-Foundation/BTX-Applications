// The Fundraising page's live reads, as the signed-in person (the session client, so row-level security applies). Two
// kinds: `rows`, one request (lib/daily-db.ts readRows), for reads that are small by nature (one checklist, one goal); and
// `all`, which pages through a table 1,000 rows at a time (PostgREST's per-request cap, applied silently) in a stable
// order by a unique column, so a sum is never an undercount. Server side only.
import { readRows, type ReadOpts, type Row } from './daily-db';
import { pageAll } from './goals-map';
import { sessionClient } from './supabase-server';
import type { FrReader } from './fundraising-live';

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

// Every row matching the filters, read in pages ordered by `o.order`'s column (id by default), then the `then`
// columns, so the order is unique and no row is skipped or read twice between pages. pageAll stops on an empty page and throws past its ceiling (never a partial result).
async function readAll(table: string, select: string, o: ReadOpts = {}, then: string[] = []): Promise<Row[]> {
  const by = o.order?.[0] ?? 'id';
  const client = (await sessionClient()) as unknown as Loose;
  return pageAll(async (from, to) => {
    let q = client.from(table).select(select);
    for (const [c, v] of Object.entries(o.eq ?? {})) q = q.eq(c, v);
    for (const [c, v] of Object.entries(o.in ?? {})) q = q.in(c, v);
    for (const [c, v] of Object.entries(o.gte ?? {})) q = q.gte(c, v);
    for (const [c, v] of Object.entries(o.lte ?? {})) q = q.lte(c, v);
    q = q.order(by, { ascending: true });
    for (const c of then) q = q.order(c, { ascending: true });
    const { data, error } = await q.range(from, to);
    if (error) throw error;
    return data ?? [];
  });
}

/** The reader live mode uses. */
export const fundraisingReader: FrReader = { rows: readRows, all: readAll };
