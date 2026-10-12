import { describe, expect, it } from 'vitest';
import { checkNewSlots, easternToUtc, isVideoUrl, slotFor } from '@/lib/pairing-slots';

const NOW = new Date('2026-10-12T12:00:00Z');
const base = { windowStart: '2026-10-15', windowEnd: '2026-10-17', existing: [], now: NOW };

describe('easternToUtc and slotFor', () => {
  it('converts Eastern wall time to UTC, in daylight and standard time', () => {
    expect(easternToUtc('2026-10-15', '10:00')).toBe('2026-10-15T14:00:00.000Z'); // EDT, UTC-4
    expect(easternToUtc('2026-12-15', '10:00')).toBe('2026-12-15T15:00:00.000Z'); // EST, UTC-5
    expect(easternToUtc('2026-11-01', '09:00')).toBe('2026-11-01T14:00:00.000Z'); // the day clocks go back
  });
  it('rejects bad dates and times', () => {
    expect(easternToUtc('2026-02-31', '10:00')).toBeNull();
    expect(easternToUtc('2026-10-15', '25:00')).toBeNull();
    expect(easternToUtc('10/15/2026', '10:00')).toBeNull();
    expect(easternToUtc('2026-10-15', '9:00')).toBeNull();
  });
  it('makes slots 30 minutes long', () => {
    expect(slotFor('2026-10-15', '10:00')).toEqual({ startsAt: '2026-10-15T14:00:00.000Z', endsAt: '2026-10-15T14:30:00.000Z' });
  });
});

describe('checkNewSlots', () => {
  it('accepts times inside the window', () => {
    const r = checkNewSlots({ ...base, entries: [{ date: '2026-10-15', startTime: '10:00' }, { date: '2026-10-17', startTime: '18:30' }] });
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(2);
  });
  it('rejects a date outside the window, including the day after', () => {
    expect(checkNewSlots({ ...base, entries: [{ date: '2026-10-18', startTime: '10:00' }] }).errors[0]).toMatch(/outside the interview dates/);
    expect(checkNewSlots({ ...base, entries: [{ date: '2026-10-14', startTime: '10:00' }] }).errors).toHaveLength(1);
  });
  it('rejects a bad time and a time that has passed', () => {
    expect(checkNewSlots({ ...base, entries: [{ date: '2026-10-15', startTime: 'ten' }] }).errors[0]).toMatch(/not a valid/);
    expect(checkNewSlots({ ...base, now: new Date('2026-10-15T15:00:00Z'), entries: [{ date: '2026-10-15', startTime: '10:00' }] }).errors[0]).toMatch(/already passed/);
  });
  it('rejects repeats and overlaps with existing slots', () => {
    const dup = checkNewSlots({ ...base, entries: [{ date: '2026-10-15', startTime: '10:00' }, { date: '2026-10-15', startTime: '10:00' }] });
    expect(dup.rows).toHaveLength(1);
    expect(dup.errors[0]).toMatch(/overlaps/);
    const ex = checkNewSlots({ ...base, existing: [{ startsAt: '2026-10-15T14:00:00.000Z', endsAt: '2026-10-15T14:30:00.000Z' }], entries: [{ date: '2026-10-15', startTime: '10:15' }] });
    expect(ex.errors[0]).toMatch(/overlaps/);
    // back to back is fine
    expect(checkNewSlots({ ...base, existing: [{ startsAt: '2026-10-15T14:00:00.000Z', endsAt: '2026-10-15T14:30:00.000Z' }], entries: [{ date: '2026-10-15', startTime: '10:30' }] }).errors).toEqual([]);
  });
  it('needs the interview dates and at least one entry', () => {
    expect(checkNewSlots({ ...base, windowStart: null, entries: [{ date: '2026-10-15', startTime: '10:00' }] }).errors[0]).toMatch(/interview dates/);
    expect(checkNewSlots({ ...base, entries: [] }).errors[0]).toMatch(/at least one/);
  });
});

describe('isVideoUrl', () => {
  it('accepts https links and rejects the rest', () => {
    expect(isVideoUrl('https://meet.google.com/abc-defg-hij')).toBe(true);
    expect(isVideoUrl('http://meet.google.com/abc')).toBe(false);
    expect(isVideoUrl('https://')).toBe(false);
    expect(isVideoUrl('https://a b.com')).toBe(false);
    expect(isVideoUrl('https://localhost')).toBe(false);
    expect(isVideoUrl(`https://x.com/${'a'.repeat(500)}`)).toBe(false);
  });
});
