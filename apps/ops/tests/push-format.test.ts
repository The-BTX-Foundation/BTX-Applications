import { describe, expect, it } from 'vitest';
import { applicantNumber, BODY_MAX, clip, dayLabel, easternDay, shortDay, TITLE_MAX, tomorrowEastern, twoRows, whenLabel } from '@btx/push';

describe('applicantNumber', () => {
  it('turns an applicant code into "Applicant 15", never the full code', () => {
    expect(applicantNumber('APP-2026-00015')).toBe('Applicant 15');
    expect(applicantNumber('APP-2026-00003')).toBe('Applicant 3');
    expect(applicantNumber('app-2026-00120 ')).toBe('Applicant 120');
  });
  it('falls back to "Applicant" with no trailing number', () => {
    expect(applicantNumber('')).toBe('Applicant');
    expect(applicantNumber(null)).toBe('Applicant');
    expect(applicantNumber('no number here')).toBe('Applicant');
  });
});

describe('clip', () => {
  it('collapses whitespace and newlines to one line', () => {
    expect(clip('  a \n\n b\tc ', 20)).toBe('a b c');
  });
  it('cuts with an ellipsis at the limit, never past it', () => {
    const out = clip('x'.repeat(100), 10);
    expect(out).toHaveLength(10);
    expect(out.endsWith('…')).toBe(true);
  });
  it('leaves short text alone and survives null', () => {
    expect(clip('short', 10)).toBe('short');
    expect(clip(undefined as unknown as string, 10)).toBe('');
  });
});

describe('twoRows', () => {
  it('keeps a title up to 40 characters and one body line up to 60', () => {
    const w = twoRows({ title: 'T'.repeat(80), body: 'B'.repeat(200) });
    expect(w.title.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(w.body!.length).toBeLessThanOrEqual(BODY_MAX);
  });
  it('never has a newline in either row', () => {
    const w = twoRows({ title: 'Line one\nLine two', body: 'a\nb\nc' });
    expect(w.title).not.toMatch(/\n/);
    expect(w.body).not.toMatch(/\n/);
  });
  it('omits an empty body and keeps a title', () => {
    expect(twoRows({ title: 'Hello', body: '   ' })).toEqual({ title: 'Hello' });
    expect(twoRows({ title: '' }).title).toBe('BTX Ops Hub');
  });
});

describe('Eastern dates', () => {
  it('writes an interview time in Eastern, in winter and in summer time', () => {
    expect(whenLabel('2026-11-10T23:00:00Z')).toBe('Tue Nov 10, 6:00 PM'); // EST (UTC-5)
    expect(whenLabel('2026-10-20T22:00:00Z')).toBe('Tue Oct 20, 6:00 PM'); // EDT (UTC-4)
    expect(whenLabel('2026-11-11T13:30:00Z')).toBe('Wed Nov 11, 8:30 AM');
  });
  it('writes a deadline day', () => {
    expect(dayLabel('2026-11-07T04:59:00Z')).toBe('Fri Nov 6'); // 11:59 PM Eastern on Nov 6
  });
  it('knows tomorrow across the daylight-saving change', () => {
    expect(tomorrowEastern(new Date('2026-10-31T15:00:00Z'))).toBe('2026-11-01');
    expect(tomorrowEastern(new Date('2026-11-01T15:00:00Z'))).toBe('2026-11-02'); // a 25-hour day
    expect(easternDay(new Date('2026-11-07T03:30:00Z'))).toBe('2026-11-06');
  });
  it('writes a calendar day', () => {
    expect(shortDay('2026-11-20')).toBe('Nov 20');
    expect(shortDay('nope')).toBe('');
  });
});
