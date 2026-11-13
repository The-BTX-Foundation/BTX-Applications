import { describe, expect, it } from 'vitest';
import { CAL_MAX_PAGES, CalendarReadTruncated, chunks, readAllPages } from '@/lib/calendar-paging';

// A fake table of `n` rows read by inclusive row positions, recording each request.
const table = (n: number) => {
  const calls: [number, number][] = [];
  const fetch = async (from: number, to: number) => {
    calls.push([from, to]);
    return Array.from({ length: Math.max(0, Math.min(n, to + 1) - from) }, (_, k) => from + k);
  };
  return { calls, fetch };
};

describe('readAllPages', () => {
  it('reads a short table and stops on the empty page after it', async () => {
    const t = table(3);
    expect(await readAllPages('x', t.fetch, 1000)).toEqual([0, 1, 2]);
    expect(t.calls).toEqual([[0, 999], [3, 1002]]);
  });
  it('pages until an empty page, with no row skipped or repeated', async () => {
    const t = table(2500);
    const rows = await readAllPages('x', t.fetch, 1000);
    expect(rows).toHaveLength(2500);
    expect(new Set(rows).size).toBe(2500);
    expect(t.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999], [2500, 3499]]);
  });
  it('starts each page after the rows actually returned when the server caps a page below the asked size', async () => {
    const calls: [number, number][] = [];
    // A server whose max rows is 300: asked for 1,000, it returns at most 300.
    const fetch = async (from: number, to: number) => {
      calls.push([from, to]);
      return Array.from({ length: Math.max(0, Math.min(700, to + 1, from + 300) - from) }, (_, k) => from + k);
    };
    const rows = await readAllPages('x', fetch, 1000);
    expect(rows).toEqual(Array.from({ length: 700 }, (_, i) => i));
    expect(calls.map((c) => c[0])).toEqual([0, 300, 600, 700]);
  });
  it('stops at 20 pages and reports truncation as an error when the last page still had rows', async () => {
    const t = table(1_000_000);
    await expect(readAllPages('calendar_events', t.fetch, 10)).rejects.toBeInstanceOf(CalendarReadTruncated);
    expect(t.calls).toHaveLength(CAL_MAX_PAGES);
  });
  it('is not truncated when the 20th page is the empty one', async () => {
    const t = table(19 * 10);
    expect(await readAllPages('x', t.fetch, 10)).toHaveLength(190);
    expect(t.calls).toHaveLength(CAL_MAX_PAGES);
  });
  it('passes a refused read on', async () => {
    await expect(readAllPages('x', async () => Promise.reject(new Error('no')))).rejects.toThrow('no');
  });
});

describe('chunks', () => {
  it('splits ids into groups of 100', () => {
    const ids = Array.from({ length: 250 }, (_, i) => String(i));
    expect(chunks(ids).map((c) => c.length)).toEqual([100, 100, 50]);
    expect(chunks([])).toEqual([]);
  });
});
