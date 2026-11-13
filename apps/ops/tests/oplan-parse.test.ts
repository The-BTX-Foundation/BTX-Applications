// The "Plan a post or issue" line reader (lib/oplan-parse.ts): dates, day words, owners, the channel and removed chips.
import { describe, expect, it } from 'vitest';
import { pnDayFrom, readLine } from '@/lib/oplan-parse';
import { PN_PEOPLE, PN_TODAY } from '@/mock/oplan-view';

const none = { date: false, owner: false };
const read = (text: string, dismissed = none, withChannel = true) => readLine(PN_TODAY, text, PN_PEOPLE, dismissed, withChannel);

describe('readLine', () => {
  it('reads the demo example', () => {
    expect(read('Giving Tuesday thanks dec 2 camila')).toEqual({ title: 'Giving Tuesday thanks', due: '2026-12-02', owner: 'ck', channel: 'Instagram' });
  });

  it('reads a long month name and a "by" prefix', () => {
    expect(read('Board recap by november 20').due).toBe('2026-11-20');
  });

  it('ignores an impossible day', () => {
    const p = read('Recap nov 31');
    expect(p.due).toBeNull();
  });

  it('keeps a name that is inside a short title', () => {
    const p = read('Meet Keith');
    expect(p.owner).toBe('kd');
    expect(p.title).toBe('Meet Keith');
  });

  it('reads the newsletter only when issues can be added', () => {
    expect(read('December issue dec 1').channel).toBe('Newsletter');
    expect(read('December issue dec 1', none, false).channel).toBe('Instagram');
  });

  it('does not read a removed date or owner', () => {
    const p = read('Giving Tuesday thanks dec 2 camila', { date: true, owner: true });
    expect(p.due).toBeNull();
    expect(p.owner).toBeNull();
    expect(p.title).toContain('dec 2');
  });

  it('capitalises and collapses spaces', () => {
    expect(read('  spring   teaser  ').title).toBe('Spring teaser');
  });
});

describe('readLine edge cases (review)', () => {
  it('reads next month across the year end', () => {
    expect(readLine('2026-12-10', 'Winter recap jan 5', PN_PEOPLE, none, true).due).toBe('2027-01-05');
  });
  it('reads an ordinal day and refuses a day the month lacks', () => {
    expect(read('Recap dec 4th').due).toBe('2026-12-04');
    expect(read('Recap dec 4th').title).toBe('Recap');
    expect(read('Recap nov 31').due).toBeNull();
  });
  it('keeps the demo day words but not ordinary words or event names', () => {
    expect(read('Board recap friday').due).toBe('2026-11-13');
    expect(read('Board recap fri').due).toBe('2026-11-13');
    expect(read('Sun safety tips').due).toBeNull();
    expect(read('Recap of the Friday social').due).toBeNull();
    expect(read('Giving Tuesday thanks').due).toBeNull();
    expect(read('Recap due wed').due).toBe('2026-11-11');
  });
  it('reads a name only as the last word or after "for"', () => {
    expect(read('Walk 10 miles for charity').owner).toBeNull();
    expect(read('Charity walk for Miles dec 3')).toMatchObject({ owner: 'md', title: 'Charity walk', due: '2026-12-03' });
  });
});

describe('pnDayFrom', () => {
  it('turns day words into days (Tue Nov 10)', () => {
    expect(pnDayFrom(PN_TODAY, 'today')).toBe('2026-11-10');
    expect(pnDayFrom(PN_TODAY, 'tomorrow')).toBe('2026-11-11');
    expect(pnDayFrom(PN_TODAY, 'next week')).toBe('2026-11-16');
    expect(pnDayFrom(PN_TODAY, 'friday')).toBe('2026-11-13');
    expect(pnDayFrom(PN_TODAY, 'tuesday')).toBe('2026-11-17');
  });
});
