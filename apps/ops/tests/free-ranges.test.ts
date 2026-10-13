import { describe, expect, it } from 'vitest';
import { blocksToRanges, cleanRanges, covers, easternDayMinutes, freeMinutes, mergeRanges, rangesToBlocks, toHHMM, toMinuteRange, toMinutes, toRange, windowDays } from '@/lib/free-ranges';

const D = '2026-10-15';

describe('minutes and HH:MM', () => {
  it('converts both ways, with 24:00 as the end of the day', () => {
    expect(toMinutes('09:30')).toBe(570);
    expect(toMinutes('9:00')).toBe(540);
    expect(toMinutes('24:00')).toBe(1440);
    expect(toMinutes('24:30')).toBeNull();
    expect(toMinutes('noon')).toBeNull();
    expect(toHHMM(570)).toBe('09:30');
    expect(toHHMM(1440)).toBe('24:00');
  });
  it('turns screen ranges into minute ranges and back', () => {
    expect(toMinuteRange({ day: D, start: '09:00', end: '12:30' })).toEqual({ day: D, startMin: 540, endMin: 750 });
    expect(toMinuteRange({ day: '2026-02-31', start: '09:00', end: '10:00' })).toBeNull();
    expect(toRange({ day: D, startMin: 540, endMin: 750 })).toEqual({ day: D, start: '09:00', end: '12:30' });
  });
});

describe('mergeRanges', () => {
  it('rounds the start down and the end up to the half hour', () => {
    expect(mergeRanges([{ day: D, startMin: 545, endMin: 601 }])).toEqual([{ day: D, startMin: 540, endMin: 630 }]);
  });
  it('merges overlapping and touching ranges on the same day only', () => {
    expect(
      mergeRanges([
        { day: D, startMin: 600, endMin: 660 },
        { day: D, startMin: 540, endMin: 600 },
        { day: D, startMin: 630, endMin: 720 },
        { day: '2026-10-16', startMin: 540, endMin: 600 },
      ]),
    ).toEqual([
      { day: D, startMin: 540, endMin: 720 },
      { day: '2026-10-16', startMin: 540, endMin: 600 },
    ]);
  });
  it('clips to the day and to the window, and drops empty ranges', () => {
    const window = { start: '2026-10-15', end: '2026-10-16' };
    expect(
      mergeRanges(
        [
          { day: D, startMin: -30, endMin: 1500 },
          { day: '2026-10-20', startMin: 540, endMin: 600 },
          { day: D, startMin: 600, endMin: 600 },
        ],
        window,
      ),
    ).toEqual([{ day: D, startMin: 0, endMin: 1440 }]);
  });
  it('cleans screen ranges the same way', () => {
    expect(cleanRanges([{ day: D, start: '09:10', end: '10:05' }, { day: D, start: '10:00', end: '11:00' }, { day: D, start: 'x', end: '11:00' }])).toEqual([{ day: D, start: '09:00', end: '11:00' }]);
  });
});

describe('freeMinutes and covers', () => {
  it('counts overlaps once', () => {
    expect(freeMinutes([{ day: D, startMin: 540, endMin: 660 }, { day: D, startMin: 600, endMin: 720 }, { day: '2026-10-16', startMin: 0, endMin: 30 }])).toBe(210);
  });
  it('covers needs one range holding the whole time', () => {
    const r = [{ day: D, startMin: 540, endMin: 630 }];
    expect(covers(r, D, 600, 630)).toBe(true);
    expect(covers(r, D, 615, 645)).toBe(false);
    expect(covers(r, '2026-10-16', 600, 630)).toBe(false);
  });
});

describe('old blocks', () => {
  it('maps Morning 9-12, Afternoon 12-5, Evening 5-9 to ranges', () => {
    expect(blocksToRanges([{ day: D, block: 'morning' }, { day: D, block: 'afternoon' }, { day: '2026-10-16', block: 'evening' }])).toEqual([
      { day: D, startMin: 540, endMin: 1020 },
      { day: '2026-10-16', startMin: 1020, endMin: 1260 },
    ]);
  });
  it('reads back only the blocks a range fully covers', () => {
    expect(rangesToBlocks([{ day: D, startMin: 540, endMin: 1020 }, { day: '2026-10-16', startMin: 1080, endMin: 1260 }])).toEqual([
      { day: D, block: 'morning' },
      { day: D, block: 'afternoon' },
    ]);
  });
});

describe('dates', () => {
  it('lists the window days', () => {
    expect(windowDays('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(windowDays(null, '2026-11-02')).toEqual([]);
  });
  it('reads an instant as an Eastern day and minutes', () => {
    expect(easternDayMinutes('2026-10-15T14:00:00.000Z')).toEqual({ day: D, min: 600 }); // EDT
    expect(easternDayMinutes('2026-11-16T15:30:00.000Z')).toEqual({ day: '2026-11-16', min: 630 }); // EST
    expect(easternDayMinutes('2026-10-16T01:00:00.000Z')).toEqual({ day: D, min: 1260 });
  });
});
