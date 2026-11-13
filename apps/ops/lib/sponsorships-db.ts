// The Sponsorships page's live read, as the signed-in person (the session client, so row-level security applies: admins and
// board members read `sponsorships`). Server side only. Every read pages through the table 1,000 rows at a time ordered by
// id (PostgREST stops at 1,000 rows silently), with a ceiling past which the read fails instead of drawing a partial list.
import { readPaged, type Row } from './sponsorships-map';
import { SPONSOR_COLS, type SponsorsReader } from './sponsorships-live';
import { sessionClient } from './supabase-server';

type Res = { data: Row[] | null; error: unknown };
type Q = PromiseLike<Res> & {
  gte: (c: string, v: string) => Q;
  lt: (c: string, v: string) => Q;
  is: (c: string, v: null) => Q;
  order: (c: string, o: { ascending: boolean }) => Q;
  range: (from: number, to: number) => Q;
};
type Loose = { from: (t: string) => { select: (cols: string) => Q } };

// One filtered read, every page: this year's dated rows (occurred_on from Jan 1 up to the next Jan 1), or the undated ones.
const read: SponsorsReader = async (filter) => {
  const client = (await sessionClient()) as unknown as Loose;
  return readPaged(async (from, to) => {
    let q = client.from('sponsorships').select(SPONSOR_COLS);
    q = 'year' in filter ? q.gte('occurred_on', `${filter.year}-01-01`).lt('occurred_on', `${filter.year + 1}-01-01`) : q.is('occurred_on', null);
    const { data, error } = await q.order('id', { ascending: true }).range(from, to);
    if (error) throw error;
    return data ?? [];
  });
};

/** The reader live mode uses. */
export const sessionSponsorsReader: SponsorsReader = read;
