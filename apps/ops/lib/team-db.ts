// Server-side reads of the Ops Hub tables for Today, Tasks, Goals, Calendar and the sidebar counts (live mode only). The
// generated types do not know these tables, so the client is used through a loose shape. Row-level security applies:
// a table the signed-in person may not read simply returns no rows.
import { sessionClient } from './supabase-server';

export type Row = Record<string, unknown>;
type Res = { data: Row[] | null; error: unknown };
type Q = PromiseLike<Res> & {
  eq: (c: string, v: unknown) => Q;
  in: (c: string, v: unknown[]) => Q;
  gte: (c: string, v: unknown) => Q;
  lte: (c: string, v: unknown) => Q;
  order: (c: string, o: { ascending: boolean }) => Q;
};
export type Loose = {
  from: (t: string) => { select: (cols: string) => Q };
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<Res>;
  auth: { getUser: () => Promise<{ data: { user: { id: string; app_metadata?: Record<string, unknown> } | null } }> };
};

export type Filter = { eq?: Record<string, unknown>; in?: Record<string, unknown[]>; gte?: Record<string, unknown>; lte?: Record<string, unknown>; order?: [string, boolean] };

export async function looseClient(): Promise<Loose> {
  return (await sessionClient()) as unknown as Loose;
}

// Reads rows; throws when the database refuses (the loaders turn that into the "didn't load" card).
export async function rows(client: Loose, table: string, select: string, f: Filter = {}): Promise<Row[]> {
  let q = client.from(table).select(select);
  for (const [c, v] of Object.entries(f.eq ?? {})) q = q.eq(c, v);
  for (const [c, v] of Object.entries(f.in ?? {})) q = q.in(c, v);
  for (const [c, v] of Object.entries(f.gte ?? {})) q = q.gte(c, v);
  for (const [c, v] of Object.entries(f.lte ?? {})) q = q.lte(c, v);
  if (f.order) q = q.order(f.order[0], { ascending: f.order[1] });
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// The signed-in person's id and role (app_metadata.role), or nulls.
export async function whoAmI(client: Loose): Promise<{ id: string | null; role: string | null }> {
  const { data } = await client.auth.getUser();
  const role = data.user?.app_metadata?.role;
  return { id: data.user?.id ?? null, role: typeof role === 'string' ? role : null };
}
