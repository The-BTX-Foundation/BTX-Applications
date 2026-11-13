// The Instagram page's live reads, as the signed-in person (the session client, so row-level security applies). Server side
// only. Every read pages 1,000 rows at a time ordered by id (PostgREST stops at 1,000 rows silently), with a ceiling past
// which the read fails instead of drawing a partial list.
import { readPaged, type Row } from './instagram-map';
import { POST_COLS, type IgReader, type PostFilter } from './instagram-live';
import { sessionClient } from './supabase-server';

type Res = { data: Row[] | null; error: unknown };
type Q = PromiseLike<Res> & {
  eq: (c: string, v: unknown) => Q;
  neq: (c: string, v: unknown) => Q;
  gte: (c: string, v: string) => Q;
  lt: (c: string, v: string) => Q;
  is: (c: string, v: null) => Q;
  order: (c: string, o: { ascending: boolean }) => Q;
  limit: (n: number) => Q;
  range: (from: number, to: number) => Q;
};
type Loose = { from: (t: string) => { select: (cols: string) => Q } };

const client = async () => (await sessionClient()) as unknown as Loose;

/** A failed read: the table and the error code only (no row data, no names), for the one server log line. */
export type IgReadError = { table: string; code: string };

// The data of one answer, or the read error thrown.
const rowsOf = (table: string, { data, error }: Res): Row[] => {
  if (error) throw { table, code: String((error as { code?: unknown }).code ?? 'unknown') } satisfies IgReadError;
  return data ?? [];
};

/** The reader live mode uses. */
export const sessionIgReader: IgReader = {
  async channel() {
    const c = await client();
    const rows = rowsOf('outreach_channels', await c.from('outreach_channels').select('id, target').eq('kind', 'instagram').order('position', { ascending: true }).order('id', { ascending: true }).limit(1));
    return rows[0] ?? null;
  },
  async posts(channelId: string, filter: PostFilter) {
    const c = await client();
    return readPaged(async (from, to) => {
      let q = c.from('posts').select(POST_COLS).eq('channel_id', channelId);
      if ('from' in filter) q = q.gte('post_on', filter.from);
      else if ('undated' in filter) q = q.is('post_on', null);
      else q = q.lt('post_on', filter.openBefore).neq('status', 'posted');
      return rowsOf('posts', await q.order('id', { ascending: true }).range(from, to));
    });
  },
  async staff() {
    const c = await client();
    return readPaged(async (from, to) => rowsOf('staff_profiles', await c.from('staff_profiles').select('user_id, display_name, initials').order('user_id', { ascending: true }).range(from, to)));
  },
};
