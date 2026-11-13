// The pure parts of the refreshed Your availability page (lib/availability-plan.ts): spans, cuts that keep booked half
// hours, the news card, the Send label, the change list and the limit stepper.
import { describe, expect, it } from 'vitest';
import { addSpan, changeLog, cutSpan, draftSig, fromSpans, limitFloor, limitPlus, newsFor, quickPick, sendLabel, sentWords, toSpans, totalMin } from '@/lib/availability-plan';
import type { AvBooking } from '@/lib/availability-view';

const days = ['2026-11-12', '2026-11-14'];
const ada: AvBooking = { id: 'A', day: '2026-11-12', min: 1050, applicant: 'Ada Okafor', withName: 'Keith Dawson', withInitials: 'KD' };

describe('availability plan', () => {
  it('turns ranges into merged spans per day and back', () => {
    const s = toSpans(days, [
      { day: '2026-11-12', startMin: 1020, endMin: 1140 },
      { day: '2026-11-12', startMin: 1140, endMin: 1260 },
      { day: '2026-12-01', startMin: 600, endMin: 660 },
    ]);
    expect(s['2026-11-12']).toEqual([[1020, 1260]]);
    expect(fromSpans(s)).toEqual([{ day: '2026-11-12', startMin: 1020, endMin: 1260 }]);
  });
  it('a cut keeps the booked half hour and says so', () => {
    const s = addSpan(toSpans(days, []), '2026-11-12', 1020, 1260);
    const { spans, kept } = cutSpan(s, '2026-11-12', 1020, 1260, [ada]);
    expect(spans['2026-11-12']).toEqual([[1050, 1080]]);
    expect(kept.map((k) => k.applicant)).toEqual(['Ada Okafor']);
    expect(totalMin(spans)).toBe(30);
  });
  it('the news card: Nothing added yet, then the next booking only when bookings are shown, none while changes wait', () => {
    const empty = toSpans(days, []);
    expect(newsFor(empty, 0, [], true)?.kicker).toBe('Nothing added yet');
    const s = addSpan(empty, '2026-11-12', 1020, 1260);
    expect(newsFor(s, 0, [ada], true)?.title).toBe('Ada Okafor');
    expect(newsFor(s, 0, [ada], false)).toBeNull();
    expect(newsFor(s, 2, [ada], true)).toBeNull();
  });
  it('Send words, change list and sent time', () => {
    expect(sendLabel(false, 3)).toBe('Send availability');
    expect(sendLabel(true, 1)).toBe('Send change');
    expect(changeLog(['a', 'b', 'c', 'd', 'e', 'f'])).toEqual({ shown: ['c', 'd', 'e', 'f'], earlier: 2 });
    expect(sentWords('2026-11-10', '2026-11-10T14:14:00Z')).toBe('today, 9:14 AM');
    expect(sentWords('2026-11-10', '2026-11-02T23:14:00Z')).toBe('Mon Nov 2, 6:14 PM');
  });
  it('the limit never goes under the booked count', () => {
    expect(limitFloor(2)).toBe(2);
    expect(limitFloor(0)).toBe(1);
    expect(limitPlus(null, 2)).toBe(2);
    expect(limitPlus(50, 0)).toBe(50);
  });
  it('quick picks and the draft signature', () => {
    expect(quickPick('weekends', ['2026-11-13', '2026-11-14', '2026-11-15']).days).toEqual(['2026-11-14', '2026-11-15']);
    const s = toSpans(days, []);
    expect(draftSig(s, [], 5)).not.toBe(draftSig(s, [], 6));
  });
});
