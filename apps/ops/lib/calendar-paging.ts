// Paged reads for the Calendar page's live loader (lib/calendar.ts). The database API returns at most 1,000 rows per request,
// so a plain read of a growing table silently stops at row 1,000. Each Calendar read is instead fetched in pages of up to
// 1,000, ordered by a unique key. The next page starts after the rows actually returned (the server may cap a page below
// what was asked), and only an EMPTY page ends the read.
// Ceiling: 20 pages. When page 20 still returned rows, the read is NOT returned cut short: it throws
// CalendarReadTruncated and the page shows its load error. Pure (the fetching is passed in), so it is unit-tested
// (tests/calendar-paging.test.ts).

/** Rows per request: the database API's cap. */
export const CAL_PAGE_SIZE = 1000;
/** The most pages one read may take (20,000 rows). */
export const CAL_MAX_PAGES = 20;
/** Ids per `in (...)` read (a long id list would overflow the request URL). */
export const CAL_ID_CHUNK = 100;

/** Thrown when a read reached the page ceiling and more rows may exist. Never swallowed: the page shows its load error. */
export class CalendarReadTruncated extends Error {
  constructor(public readonly table: string) {
    super(`Calendar read of ${table} reached ${CAL_MAX_PAGES} pages`);
    this.name = 'CalendarReadTruncated';
  }
}

/**
 * Reads every row through `fetchPage(from, to)` (inclusive row positions, as `.range()` takes them). Each page starts after
 * the rows read so far; an empty page ends the read; throws CalendarReadTruncated when page `max` still returned rows.
 */
export async function readAllPages<T>(table: string, fetchPage: (from: number, to: number) => Promise<T[]>, size = CAL_PAGE_SIZE, max = CAL_MAX_PAGES): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < max; p++) {
    const rows = await fetchPage(out.length, out.length + size - 1);
    if (rows.length === 0) return out;
    out.push(...rows);
  }
  throw new CalendarReadTruncated(table);
}

/** Splits ids into chunks of `size` (for `in (...)` reads). */
export function chunks<T>(ids: T[], size = CAL_ID_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}
