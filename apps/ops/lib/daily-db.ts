// A small loose reader for the daily pages (Today, Tasks, Goals, Calendar, Board chat, sidebar counts). The generated types
// do not know the Ops Hub tables, so the server client is used through a loose shape. Server side only; RLS applies as the
// signed-in person.
import { sessionClient } from './supabase-server';

export type Row = Record<string, unknown>;
type Res = { data: Row[] | null; error: unknown };
type Q = PromiseLike<Res> & {
  eq: (c: string, v: unknown) => Q;
  in: (c: string, v: unknown[]) => Q;
  gte: (c: string, v: string) => Q;
  lte: (c: string, v: string) => Q;
  order: (c: string, o: { ascending: boolean }) => Q;
  limit: (n: number) => Q;
};
type Loose = {
  from: (t: string) => { select: (cols: string) => Q };
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<Res>;
};

export type ReadOpts = { eq?: Record<string, unknown>; gte?: Record<string, string>; lte?: Record<string, string>; order?: [string, boolean]; limit?: number };

// Reads rows from a table or view; throws when the database says no (the loaders turn that into the "didn't load" card).
export async function readRows(table: string, select: string, o: ReadOpts = {}): Promise<Row[]> {
  const client = (await sessionClient()) as unknown as Loose;
  let q = client.from(table).select(select);
  for (const [c, v] of Object.entries(o.eq ?? {})) q = q.eq(c, v);
  for (const [c, v] of Object.entries(o.gte ?? {})) q = q.gte(c, v);
  for (const [c, v] of Object.entries(o.lte ?? {})) q = q.lte(c, v);
  if (o.order) q = q.order(o.order[0], { ascending: o.order[1] });
  if (o.limit) q = q.limit(o.limit);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// Calls a database function and returns its rows.
export async function callRpc(fn: string, args: Record<string, unknown> = {}): Promise<Row[]> {
  const client = (await sessionClient()) as unknown as Loose;
  const { data, error } = await client.rpc(fn, args);
  if (error) throw error;
  return data ?? [];
}

// The signed-in person's id and role (from the session), or null.
export async function whoAmI(): Promise<{ id: string; role: string } | null> {
  const client = await sessionClient();
  const { data } = await client.auth.getUser();
  const u = data.user;
  if (!u) return null;
  return { id: u.id, role: String(u.app_metadata?.role ?? '') };
}
