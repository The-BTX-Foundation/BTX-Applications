// The refreshed Sponsorships page's pure logic (lib/sponsorships-map.ts): money words, the year's rows, the line reader,
// the draft checks, the "did it save?" verdict after a failed log, and the paged read.
import { describe, expect, it } from 'vitest';
import {
  afterCheck,
  byDate,
  fullDate,
  draftProblem,
  LOG_WORDS,
  mapRows,
  money,
  newsOf,
  readLine,
  readPaged,
  rowFromInput,
  toInput,
  totals,
  verdict,
  whenWords,
} from '@/lib/sponsorships-map';

const TODAY = '2026-11-10';

describe('money', () => {
  it('drops cents when whole and keeps two places otherwise', () => {
    expect(money(275_000)).toBe('$2,750');
    expect(money(0)).toBe('$0');
    expect(money(1_234_567)).toBe('$12,345.67');
    expect(money(1_050)).toBe('$10.50');
  });
});

describe('mapRows', () => {
  const rows = [
    { id: 'b', title: 'Later', kind: 'travel', students: 2, amount_cents: 500, when_label: '', occurred_on: '2026-12-31', status: 'planned' },
    { id: 'a', title: 'Earlier', kind: 'fee', students: 1, amount_cents: 100, when_label: 'Spring 2026', occurred_on: '2026-04-18', status: 'done' },
    { id: 'c', title: 'Gone', kind: 'other', students: 0, amount_cents: 0, when_label: '', occurred_on: '2026-05-01', status: 'cancelled' },
    { id: 'd', title: 'Last year', kind: 'other', students: 0, amount_cents: 0, when_label: '', occurred_on: '2025-05-01', status: 'done' },
    { id: 'e', title: 'Undated', kind: 'odd', students: -3, amount_cents: 'x', when_label: null, occurred_on: null, status: null },
  ];
  const out = mapRows(rows, 2026);
  it('drops cancelled and other-year rows, keeps undated ones last', () => {
    expect(out.map((r) => r.id)).toEqual(['a', 'b', 'e']);
  });
  it('maps words, states and bad values safely', () => {
    expect(out[0]).toMatchObject({ when: 'Spring 2026', state: 'done', kind: 'fee', cents: 100 });
    expect(out[1]).toMatchObject({ when: 'Thu Dec 31', state: 'planned' });
    expect(out[2]).toMatchObject({ when: 'Date not set', kind: 'conference', students: 0, cents: 0, on: null, state: 'done' });
  });
  it('totals and the news card', () => {
    // Only done rows count as spent (the planned one, 500 cents and 2 students, does not).
    expect(totals(out)).toEqual({ cents: 100, students: 1 });
    expect(newsOf(out)).toMatchObject({ row: { id: 'b' }, open: 1 });
    expect(newsOf([out[0]])).toBeNull();
  });
  it('whenWords prefers the label', () => {
    expect(whenWords('  Fall 2026 ', '2026-10-01')).toBe('Fall 2026');
  });
});

describe('readLine month words and typed years', () => {
  it('reads only real month words: "Junior 2" and "Decathlon 3" are titles, not dates', () => {
    expect(readLine('Junior 2 conference $50', TODAY)).toMatchObject({ dated: false, on: TODAY, title: 'Junior 2 conference' });
    expect(readLine('Decathlon 3 $50', TODAY)).toMatchObject({ dated: false, on: TODAY });
    expect(readLine('fee $20 December 5', TODAY)).toMatchObject({ on: '2025-12-05', dated: true });
    expect(readLine('fee $20 Sept 5', TODAY)).toMatchObject({ on: '2026-09-05' });
    expect(readLine('fee $20 Oct. 5', TODAY)).toMatchObject({ on: '2026-10-05' });
  });
  it('accepts "Dec 5, 2025" and "Dec 5 \'25"', () => {
    expect(readLine('fee $20 Dec 5, 2025', TODAY)).toMatchObject({ on: '2025-12-05', title: 'Fee', future: false });
    expect(readLine("fee $20 Dec 5 '25", TODAY)).toMatchObject({ on: '2025-12-05', title: 'Fee', future: false });
  });
  it('Feb 29 with no year is the most recent leap day', () => {
    expect(readLine('fee $20 Feb 29', TODAY)).toMatchObject({ on: '2024-02-29', dated: true });
    expect(readLine('fee $20 Feb 29', '2028-03-01')).toMatchObject({ on: '2028-02-29' });
  });
  it('today and yesterday are allowed; a typed future date is refused', () => {
    expect(draftProblem(readLine('fee $20 Nov 10', TODAY))).toBeNull();
    expect(readLine('fee $20 Nov 9', TODAY)).toMatchObject({ on: '2026-11-09' });
    expect(draftProblem(readLine("fee $20 Nov 11 '26", TODAY))).toMatch(/hasn't come yet/);
  });
});

describe('readLine', () => {
  it('reads the four fields from the demo example', () => {
    expect(readLine('NSBE regional conference 3 students $600 Dec 5', TODAY)).toEqual({
      title: 'NSBE regional conference',
      kind: 'conference',
      students: 3,
      cents: 60_000,
      when: 'Fri Dec 5, 2025',
      on: '2025-12-05',
      dated: true,
      future: false,
    });
  });
  it('a day with no year is the last time it came (year end)', () => {
    expect(readLine('NSBE $600 Dec 28', '2027-01-03')).toMatchObject({ on: '2026-12-28', when: 'Mon Dec 28, 2026', future: false });
    expect(readLine('fee $20 Jan 3', '2027-01-03')).toMatchObject({ on: '2027-01-03', when: 'Sun Jan 3', future: false });
    expect(readLine('fee $20 Jan 2', '2027-01-03')).toMatchObject({ on: '2027-01-02', when: 'Sat Jan 2', future: false });
    expect(readLine('fee $20 Jan 3', TODAY)).toMatchObject({ on: '2026-01-03', when: 'Sat Jan 3' });
  });
  it('a typed day after today is refused', () => {
    const d = readLine('fee $20 Jan 3 2027', TODAY);
    expect(d).toMatchObject({ on: '2027-01-03', future: true });
    expect(draftProblem(d)).toBe("That date hasn't come yet. Log it once it's paid.");
    expect(draftProblem(readLine('fee $20 Nov 11 2026', TODAY))).not.toBeNull();
    expect(draftProblem(readLine('fee $20 Nov 10 2026', TODAY))).toBeNull();
  });
  it('the chip and confirm date always carry the year', () => {
    expect(fullDate('2026-12-05')).toBe('Sat Dec 5, 2026');
  });
  it('keeps today as the date for a season or no date', () => {
    expect(readLine('travel grant $1,200.50 Spring 2026', TODAY)).toMatchObject({ kind: 'travel', cents: 120_050, when: 'Spring 2026', on: TODAY, dated: false });
    expect(readLine('registration fees $40', TODAY)).toMatchObject({ kind: 'fee', when: '', on: TODAY, students: null });
  });
  it('ignores an impossible day and leaves it in the title', () => {
    const d = readLine('thing $5 Feb 30', TODAY);
    expect(d.on).toBe(TODAY);
    expect(d.title).toContain('Feb 30');
  });
});

describe('draftProblem', () => {
  it('names the first problem, or null', () => {
    expect(draftProblem(readLine('$600', TODAY))).toBe('Say what it was for.');
    expect(draftProblem(readLine('NSBE', TODAY))).toBe('Add the amount, like $600.');
    expect(draftProblem(readLine('NSBE $0', TODAY))).toBe('The amount must be more than $0.');
    expect(draftProblem({ ...readLine('NSBE $5', TODAY), title: 'x'.repeat(201) })).toMatch(/200/);
    expect(draftProblem(readLine('NSBE $5', TODAY))).toBeNull();
  });
  it('bounds the amount and the students', () => {
    expect(draftProblem(readLine('NSBE $1,000,000', TODAY))).toBeNull();
    expect(draftProblem(readLine('NSBE $1,000,000.01', TODAY))).toBe('Keep the amount at $1,000,000 or less.');
    expect(draftProblem(readLine('NSBE 10000 students $5', TODAY))).toBeNull();
    expect(draftProblem(readLine('NSBE 10001 students $5', TODAY))).toBe('Keep students at 10,000 or less.');
  });
  it('sorts by plain code points, the same on server and browser', () => {
    const r = (id: string, title: string) => ({ id, title, kind: 'other' as const, students: 0, cents: 0, when: '', on: '2026-01-01', state: 'done' as const });
    expect([r('1', 'b'), r('2', 'B'), r('3', 'a'), r('4', 'a')].sort(byDate).map((x) => x.id)).toEqual(['2', '3', '4', '1']);
  });
  it('toInput and rowFromInput fill defaults', () => {
    const p = toInput(readLine('NSBE $5', TODAY));
    expect(p).toEqual({ title: 'NSBE', kind: 'conference', students: 0, cents: 500, when: '', on: TODAY });
    expect(rowFromInput('n1', p)).toMatchObject({ id: 'n1', when: 'Tue Nov 10', state: 'done' });
  });
});

describe('verdict and afterCheck', () => {
  it('a new matching id means it saved: never resend', () => {
    expect(verdict(['a'], ['a', 'b'])).toEqual({ state: 'saved', id: 'b' });
    expect(afterCheck(verdict(['a'], ['a', 'b']))).toEqual({ next: 'logged', id: 'b' });
  });
  it('the same ids mean it did not save: Try again is offered', () => {
    expect(afterCheck(verdict(['a'], ['a']))).toEqual({ next: 'retry', words: LOG_WORDS.notSaved });
    expect(afterCheck(verdict([], []))).toEqual({ next: 'retry', words: LOG_WORDS.notSaved });
  });
  it('a failed read means unknown: only Check again', () => {
    expect(afterCheck(verdict(null, ['a']))).toEqual({ next: 'recheck', words: LOG_WORDS.unknown });
    expect(afterCheck(verdict(['a'], null))).toEqual({ next: 'recheck', words: LOG_WORDS.unknown });
  });
  it('has the spec words', () => {
    expect(LOG_WORDS.noCategory).toBe('Budget has no Sponsorships line for that year yet.');
    expect(LOG_WORDS.checking).toBe('Checking whether it saved…');
  });
});

describe('readPaged', () => {
  it('reads every page until an empty one, asking for the next range each time', async () => {
    const asked: [number, number][] = [];
    const data = Array.from({ length: 5 }, (_, i) => i);
    const out = await readPaged(async (from, to) => {
      asked.push([from, to]);
      return data.slice(from, to + 1);
    }, 2, 10);
    expect(out).toEqual(data);
    expect(asked).toEqual([[0, 1], [2, 3], [4, 5], [5, 6]]);
  });
  it('refuses a partial list past the ceiling', async () => {
    await expect(readPaged(async () => [1, 2], 2, 3)).rejects.toThrow(/refusing a partial list/);
  });
});
