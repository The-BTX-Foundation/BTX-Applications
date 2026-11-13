// The Applicants pages' live reads, as the signed-in person (the session client, so row-level security applies). Every
// read pages through 1,000 rows at a time in a stable order (PostgREST's per-request cap applies silently), so no list is
// ever cut short. Read-only. Server side only.
import { pageAll, type Row } from './applicants-map';
import { sessionClient } from './supabase-server';
import type { ApReader, ApReadOpts } from './applicants-live';

type Res = { data: Row[] | null; error: unknown };
type Q = PromiseLike<Res> & {
  eq: (c: string, v: unknown) => Q;
  in: (c: string, v: unknown[]) => Q;
  order: (c: string, o: { ascending: boolean }) => Q;
  range: (from: number, to: number) => Q;
};
type Loose = { from: (t: string) => { select: (cols: string) => Q }; rpc: (fn: string, args: Record<string, unknown>) => Q };

// Every row matching the filters, read in pages ordered by `o.order` (its last column unique). Throws when the database says no.
async function readAll(table: string, select: string, o: ApReadOpts): Promise<Row[]> {
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

// Every row a set-returning function gives, paged the same way.
async function readRpc(fn: string, args: Record<string, unknown>, order: string[]): Promise<Row[]> {
  const client = (await sessionClient()) as unknown as Loose;
  return pageAll(async (from, to) => {
    let q = client.rpc(fn, args);
    for (const c of order) q = q.order(c, { ascending: true });
    const { data, error } = await q.range(from, to);
    if (error) throw error;
    return data ?? [];
  });
}

/** The reader live mode uses. */
export const sessionReader: ApReader = { all: readAll, rpc: readRpc };
