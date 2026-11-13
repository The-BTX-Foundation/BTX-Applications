// Live mode: builds the Sponsorships view (lib/sponsorships-view.ts) from `sponsorships` as the signed-in person. The read
// goes through a reader (lib/sponsorships-db.ts: the session client, so row-level security applies), passed in so tests
// can stand in for the database (tests/sponsorships-live.test.ts). The mapping is pure (lib/sponsorships-map.ts).
//
// Only this Eastern year's rows are read (occurred_on in the year), paged, plus the few old rows with no date (they count for
// this year, as they always have). A failed read is never "Nothing logged in 2026 yet": the page shows its load-error card.
import { HOW_LIVE, liveCaps, mapRows, type Row } from './sponsorships-map';
import { easternDay } from './refresh-time';
import type { SponsorsResult, SponsorsView } from './sponsorships-view';

/** One filtered, paged read of `sponsorships` (every matching row, ordered by id). */
export type SponsorsReader = (filter: { year: number } | { undated: true }) => Promise<Row[]>;

/** The columns the page needs. */
export const SPONSOR_COLS = 'id, title, kind, students, amount_cents, when_label, occurred_on, status';

/** The view live mode shows when the read fails: the title and the "Sponsorships didn't load." card. */
export function failedView(today: string): SponsorsView {
  return { today, year: Number(today.slice(0, 4)), rows: [], how: HOW_LIVE, loadFailed: true, caps: liveCaps(), mockWrite: null };
}

/** Reads this year's sponsorships and returns the view (loadFailed when a read throws). `now` is for tests. */
export async function loadLiveSponsorsView(read: SponsorsReader, now = new Date()): Promise<SponsorsResult> {
  const today = easternDay(now.toISOString());
  const year = Number(today.slice(0, 4));
  try {
    const [dated, undated] = await Promise.all([read({ year }), read({ undated: true })]);
    return { today, year, rows: mapRows([...dated, ...undated], year), how: HOW_LIVE, loadFailed: false, caps: liveCaps(), mockWrite: null, failed: false };
  } catch {
    return { ...failedView(today), failed: false };
  }
}
