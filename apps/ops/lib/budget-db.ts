// The Budget page's live reads, as the signed-in person (the session client, so row-level security applies: money rows are
// admin and board only). Two kinds: `rows`, one request, for reads that are small by nature or capped with a limit (it takes
// several sort columns, so a `limit 1` read always picks the same row); and `all`, which pages through a table 1,000 rows at a
// time (the database API's silent cap) so a sum or a comment list is never cut short. The paging rule lives in
// lib/budget-map.ts (pageAll) and is unit-tested there.
import type { ReadOpts, Row } from './daily-db';
import { pageAll } from './budget-map';
import { sessionClient } from './supabase-server';
import type { BudgetReader, BuReadOpts } from './budget-live';

type Res = { data: Row[] | null; error: unknown };
type Q = PromiseLike<Res> & {
  eq: (c: string, v: unknown) => Q;
  in: (c: string, v: unknown[]) => Q;
  gte: (c: string, v: string) => Q;
  lte: (c: string, v: string) => Q;
  order: (c: string, o: { ascending: boolean }) => Q;
  limit: (n: number) => Q;
  range: (from: number, to: number) => Q;
};
type Loose = { from: (t: string) => { select: (cols: string) => Q } };

// Applies the filters of a read.
function filtered(q: Q, o: ReadOpts): Q {
  for (const [c, v] of Object.entries(o.eq ?? {})) q = q.eq(c, v);
  for (const [c, v] of Object.entries(o.in ?? {})) q = q.in(c, v);
  for (const [c, v] of Object.entries(o.gte ?? {})) q = q.gte(c, v);
  for (const [c, v] of Object.entries(o.lte ?? {})) q = q.lte(c, v);
  return q;
}

// One request: the filters, every sort column in order (`orders`, else `order`), then the limit.
async function readRowsBy(table: string, select: string, o: BuReadOpts = {}): Promise<Row[]> {
  const client = (await sessionClient()) as unknown as Loose;
  let q = filtered(client.from(table).select(select), o);
  for (const [c, asc] of o.orders ?? (o.order ? [o.order] : [])) q = q.order(c, { ascending: asc });
  if (o.limit) q = q.limit(o.limit);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// Every row matching the filters, read in pages in a stable order (`o.order`'s column, then id as the unique tie-break, so no
// row is skipped or read twice between pages).
async function readAll(table: string, select: string, o: ReadOpts = {}): Promise<Row[]> {
  const [by, asc] = o.order ?? ['id', true];
  const client = (await sessionClient()) as unknown as Loose;
  return pageAll(table, async (from, to) => {
    let q = filtered(client.from(table).select(select), o);
    q = q.order(by, { ascending: asc });
    if (by !== 'id') q = q.order('id', { ascending: true });
    const { data, error } = await q.range(from, to);
    if (error) throw error;
    return data ?? [];
  });
}

/** The reader live mode uses. */
export const sessionReader: BudgetReader = { rows: readRowsBy, all: readAll };
