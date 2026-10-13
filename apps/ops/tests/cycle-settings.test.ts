import { describe, expect, it } from 'vitest';
import {
  canPublish,
  canUnpublish,
  centsToField,
  easternParts,
  easternToIso,
  formToColumns,
  missingForPublish,
  parseAmountCents,
  rowToForm,
  statusLine,
  validateForm,
  type CycleForm,
  type CycleRow,
} from '@/lib/cycle-settings';

const full: CycleForm = {
  awardName: 'Legacy Scholarship',
  amount: '2,500.00',
  opensDate: '2026-08-17',
  opensTime: '09:00',
  closesDate: '2026-09-14',
  closesTime: '17:00',
  interviewStart: '2026-09-15',
  interviewEnd: '2026-10-09',
  decisionDate: '2026-10-23',
  nextCycleMonth: 'October',
  requirements: ['High school senior', 'Plans to study math'],
  photoDue: '2026-11-06',
  paymentNote: 'Paid to the school.',
  eventEnabled: false,
  eventDate: '',
  eventTime: '',
};
const empty: CycleForm = { ...full, awardName: '', amount: '', opensDate: '', opensTime: '', closesDate: '', closesTime: '', interviewStart: '', interviewEnd: '', decisionDate: '', nextCycleMonth: '', requirements: [], photoDue: '', paymentNote: '' };

describe('Eastern time', () => {
  it('converts summer (EDT) and winter (EST) times', () => {
    expect(easternToIso('2026-09-14', '17:00')).toBe('2026-09-14T21:00:00.000Z');
    expect(easternToIso('2026-12-01', '09:00')).toBe('2026-12-01T14:00:00.000Z');
  });
  it('round-trips', () => {
    for (const [d, t] of [['2026-03-08', '12:00'], ['2026-11-01', '23:30'], ['2026-09-14', '00:00']]) {
      const iso = easternToIso(d, t)!;
      expect(easternParts(iso)).toEqual({ date: d, time: t });
    }
  });
  it('is null for a missing or impossible date or time', () => {
    expect(easternToIso('', '09:00')).toBeNull();
    expect(easternToIso('2026-02-30', '09:00')).toBeNull();
    expect(easternToIso('2026-09-14', '25:00')).toBeNull();
  });
  it('shows Eastern, not UTC', () => {
    expect(easternParts('2026-09-15T01:00:00Z')).toEqual({ date: '2026-09-14', time: '21:00' });
  });
});

describe('amount', () => {
  it('parses dollars to cents', () => {
    expect(parseAmountCents('$2,500.00')).toBe(250000);
    expect(parseAmountCents('2500')).toBe(250000);
    expect(parseAmountCents('0')).toBeNull();
    expect(parseAmountCents('abc')).toBeNull();
    expect(parseAmountCents('')).toBeNull();
    expect(parseAmountCents('1.234')).toBeNull();
    expect(parseAmountCents('2000000')).toBeNull();
  });
  it('formats cents', () => {
    expect(centsToField(250000)).toBe('2,500.00');
    expect(centsToField(null)).toBe('');
  });
});

describe('validateForm', () => {
  it('accepts a complete, ordered form', () => expect(validateForm(full)).toEqual({}));
  it('accepts an empty draft (nothing required to save)', () => expect(validateForm(empty)).toEqual({}));
  it('needs the deadline after applications open', () => {
    expect(validateForm({ ...full, closesDate: '2026-08-17', closesTime: '08:00' }).closes).toMatch(/after applications open/);
    expect(validateForm({ ...full, closesDate: '2026-08-10' }).closes).toBeDefined();
  });
  it('needs interviews on or after the deadline, ending after they start', () => {
    expect(validateForm({ ...full, interviewStart: '2026-09-13' }).interviewStart).toBeDefined();
    expect(validateForm({ ...full, interviewStart: '2026-09-14' }).interviewStart).toBeUndefined();
    expect(validateForm({ ...full, interviewEnd: '2026-09-10' }).interviewEnd).toBeDefined();
  });
  it('needs the decision on or after the interviews', () => {
    expect(validateForm({ ...full, decisionDate: '2026-10-01' }).decisionDate).toBeDefined();
    expect(validateForm({ ...full, decisionDate: '2026-10-09' }).decisionDate).toBeUndefined();
  });
  it('checks the decision against the deadline when there are no interview dates', () => {
    expect(validateForm({ ...full, interviewStart: '', interviewEnd: '', decisionDate: '2026-09-01' }).decisionDate).toBeDefined();
  });
  it('rejects bad amounts, dates, months and long text', () => {
    expect(validateForm({ ...full, amount: 'lots' }).amount).toBeDefined();
    expect(validateForm({ ...full, photoDue: '2026-13-01' }).photoDue).toBeDefined();
    expect(validateForm({ ...full, nextCycleMonth: 'Smarch' }).nextCycleMonth).toBeDefined();
    expect(validateForm({ ...full, awardName: 'x'.repeat(121) }).awardName).toBeDefined();
    expect(validateForm({ ...full, paymentNote: 'x'.repeat(2001) }).paymentNote).toBeDefined();
    expect(validateForm({ ...full, requirements: Array(13).fill('a') }).requirements).toBeDefined();
    expect(validateForm({ ...full, requirements: ['x'.repeat(201)] }).requirements).toBeDefined();
  });
  it('checks the event date only when the event is on', () => {
    expect(validateForm({ ...full, eventEnabled: false, eventDate: '2026-02-31' }).event).toBeUndefined();
    expect(validateForm({ ...full, eventEnabled: true, eventDate: '2026-02-31' }).event).toBeDefined();
  });
});

describe('missingForPublish', () => {
  it('lists nothing for a complete form', () => expect(missingForPublish(full)).toEqual([]));
  it('lists the four required settings of an empty draft, in page order', () => {
    expect(missingForPublish(empty).map((m) => m.label)).toEqual(['Award name', 'Award amount', 'Applications open date', 'Deadline date']);
  });
  it('asks for the hour when only the date is set', () => {
    expect(missingForPublish({ ...full, closesTime: '' }).map((m) => m.label)).toEqual(['Deadline hour']);
    expect(missingForPublish({ ...full, opensTime: '' }).map((m) => m.target)).toEqual(['cs-opens-time']);
  });
  it('does not count optional settings', () => {
    expect(missingForPublish({ ...full, photoDue: '', paymentNote: '', requirements: [], nextCycleMonth: '' })).toEqual([]);
  });
});

describe('statusLine', () => {
  it('says draft, ready, published', () => {
    expect(statusLine('draft', empty)).toBe("Draft · students can't see it yet");
    expect(statusLine('draft', full)).toBe('Draft · ready to publish');
    expect(statusLine('published', full, new Date('2026-09-01T00:00:00Z'))).toBe('Published · students see it now');
    expect(statusLine('published', full, new Date('2026-08-01T00:00:00Z'))).toBe('Published · students see it from Mon Aug 17');
  });
});

describe('publish and unpublish rules', () => {
  it('publishes a complete draft when nothing else is published', () => {
    expect(canPublish({ status: 'draft', missing: [], otherPublishedTerm: null })).toEqual({ ok: true });
  });
  it('explains when another cycle is published', () => {
    const r = canPublish({ status: 'draft', missing: [], otherPublishedTerm: 'Fall 2026' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/Fall 2026 is already published/);
  });
  it('refuses with missing settings, already published, archived', () => {
    expect(canPublish({ status: 'draft', missing: missingForPublish(empty), otherPublishedTerm: null }).ok).toBe(false);
    expect(canPublish({ status: 'published', missing: [], otherPublishedTerm: null }).ok).toBe(false);
    expect(canPublish({ status: 'archived', missing: [], otherPublishedTerm: null }).ok).toBe(false);
  });
  it('unpublishes only a published cycle with no applications', () => {
    expect(canUnpublish({ status: 'published', applications: 0 })).toEqual({ ok: true });
    const r = canUnpublish({ status: 'published', applications: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/move the deadline/);
    expect(canUnpublish({ status: 'draft', applications: 0 }).ok).toBe(false);
  });
});

describe('row <-> form', () => {
  const row: CycleRow = {
    id: 'x', term: 'Fall 2026', status: 'draft', award_name: 'Legacy Scholarship', award_amount_cents: 250000,
    opens_at: '2026-08-17T13:00:00Z', closes_at: '2026-09-14T21:00:00Z', interview_start: '2026-09-15', interview_end: '2026-10-09',
    decision_date: '2026-10-23', next_cycle_month: 'October', requirements: ['a', 'b'], photo_due: null, payment_note: null,
    event_enabled: true, event_at: '2026-11-14T19:30:00Z',
  };
  it('reads Eastern parts', () => {
    const f = rowToForm(row);
    expect(f).toMatchObject({ amount: '2,500.00', opensDate: '2026-08-17', opensTime: '09:00', closesTime: '17:00', eventDate: '2026-11-14', eventTime: '14:30', photoDue: '' });
  });
  it('writes the same values back, turning blanks into null', () => {
    const c = formToColumns(rowToForm(row));
    expect(c).toMatchObject({ award_amount_cents: 250000, opens_at: '2026-08-17T13:00:00.000Z', closes_at: '2026-09-14T21:00:00.000Z', photo_due: null, payment_note: null, event_at: '2026-11-14T19:30:00.000Z', requirements: ['a', 'b'] });
    expect(formToColumns({ ...rowToForm(row), eventEnabled: false }).event_at).toBeNull();
  });
});
