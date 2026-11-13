// The server's rules for one save (lib/cycle-settings-merge.ts): only the settings drawn on the page are accepted, a stale
// page is refused, every rule runs on the merged result, and only the changed columns are written.
import { describe, expect, it } from 'vitest';
import { rowToForm, type CycleRow } from '@/lib/cycle-settings';
import { ARCHIVED, NEEDS_HOUR, NO_BLANK, NO_SUCH_TIME, NOT_ALLOWED, patchProblem, planFieldSave, readPatch, STALE, unchanged } from '@/lib/cycle-settings-merge';
import { CS_VIEW, CS_VIEW_DRAFT } from '@/mock/cycle-settings-view';

const PUB: CycleRow = CS_VIEW.cycle!;
const DRAFT: CycleRow = CS_VIEW_DRAFT.cycle!;

describe('readPatch', () => {
  it('accepts page settings of the right type', () => {
    expect(readPatch({ awardName: 'X' })).toEqual({ awardName: 'X' });
    expect(readPatch({ eventEnabled: true })).toEqual({ eventEnabled: true });
    expect(readPatch({ requirements: ['a', 'b'] })).toEqual({ requirements: ['a', 'b'] });
  });
  it.each([
    ['a field not on the screen', { status: 'published' }],
    ['the term', { term: 'Spring 2099' }],
    ['a column name', { award_amount_cents: 1 }],
    ['nothing', {}],
    ['not an object', 'awardName'],
    ['an array', ['awardName']],
    ['a wrong type', { eventEnabled: 'yes' }],
    ['a number amount', { amount: 2500 }],
    ['13 requirements', { requirements: Array(13).fill('x') }],
    ['a 201-character requirement', { requirements: ['x'.repeat(201)] }],
    ['a huge string', { paymentNote: 'x'.repeat(5000) }],
  ])('refuses %s', (_n, v) => expect(readPatch(v)).toBeNull());
});

describe('planFieldSave', () => {
  const form = rowToForm(PUB);
  it('writes only the changed column', () => {
    expect(planFieldSave(PUB, { awardName: 'Legacy Award' }, { awardName: form.awardName })).toEqual({ ok: true, columns: { award_name: 'Legacy Award' } });
    expect(planFieldSave(PUB, { amount: '3,000' }, { amount: form.amount })).toEqual({ ok: true, columns: { award_amount_cents: 300_000 } });
    expect(planFieldSave(PUB, { eventEnabled: true }, { eventEnabled: false })).toEqual({ ok: true, columns: { event_enabled: true } });
  });
  it('stores a deadline as the Eastern instant and a DATE as its string', () => {
    const r = planFieldSave(PUB, { closesDate: '2026-11-08', closesTime: '23:59' }, { closesDate: form.closesDate, closesTime: form.closesTime });
    expect(r).toEqual({ ok: true, columns: { closes_at: '2026-11-09T04:59:00.000Z' } });
    expect(planFieldSave(PUB, { decisionDate: '2026-12-01' }, { decisionDate: form.decisionDate })).toEqual({ ok: true, columns: { decision_date: '2026-12-01' } });
  });
  it('writes nothing when nothing changes', () => expect(planFieldSave(PUB, { amount: '2500' }, { amount: form.amount })).toEqual({ ok: true, columns: {} }));
  it('refuses an archived cycle', () => expect(planFieldSave({ ...PUB, status: 'archived' }, { awardName: 'X' }, { awardName: form.awardName })).toEqual({ ok: false, message: ARCHIVED }));
  it('refuses when the before-values do not match the patch', () => expect(planFieldSave(PUB, { awardName: 'X' }, { amount: '1' })).toEqual({ ok: false, message: NOT_ALLOWED }));
  it('refuses a stale page', () => expect(planFieldSave(PUB, { awardName: 'X' }, { awardName: 'Something older' })).toEqual({ ok: false, message: STALE, stale: true }));
  it('a save the row already holds is a success with nothing to write, before the stale check', () => {
    // save, its answer is lost, the page sends it again with the old "before"
    const saved = { ...PUB, award_name: 'Legacy Award' };
    expect(planFieldSave(saved, { awardName: 'Legacy Award' }, { awardName: 'Legacy Scholarship' })).toEqual({ ok: true, columns: {} });
  });
  it('refuses an hour the clocks skip (Sun Mar 14, 2027, 2:30 AM Eastern does not exist)', () => {
    const draft = { ...PUB, status: 'draft' };
    expect(planFieldSave(draft, { opensDate: '2027-03-14', opensTime: '02:30' }, { opensDate: '2026-10-12', opensTime: '09:00' })).toMatchObject({ ok: false, message: NO_SUCH_TIME });
    expect(planFieldSave(draft, { eventEnabled: true, eventDate: '2027-03-14', eventTime: '02:15' } as never, { eventEnabled: false, eventDate: '', eventTime: '' } as never)).toMatchObject({ ok: false, message: NO_SUCH_TIME });
    // the hour that repeats in November exists (once each way), and an ordinary hour is fine
    expect(planFieldSave(draft, { closesDate: '2026-11-01', closesTime: '01:30' }, { closesDate: '2026-11-06', closesTime: '23:59' })).not.toMatchObject({ message: NO_SUCH_TIME });
    expect(planFieldSave(draft, { closesDate: '2027-03-14', closesTime: '03:30' }, { closesDate: '2026-11-06', closesTime: '23:59' })).not.toMatchObject({ message: NO_SUCH_TIME });
  });
  it('refuses a deadline before applications open', () => {
    const r = planFieldSave(PUB, { closesDate: '2026-10-01', closesTime: '09:00' }, { closesDate: form.closesDate, closesTime: form.closesTime });
    expect(r).toMatchObject({ ok: false, message: 'The deadline has to be after applications open.' });
  });
  it('refuses interviews out of order and a bad amount or month', () => {
    expect(planFieldSave(PUB, { interviewStart: '2026-11-20', interviewEnd: '2026-11-12' }, { interviewStart: form.interviewStart, interviewEnd: form.interviewEnd })).toMatchObject({ ok: false, message: 'Interviews end on or after they start.' });
    expect(planFieldSave(PUB, { amount: '-5' }, { amount: form.amount }).ok).toBe(false);
    expect(planFieldSave(PUB, { amount: '2,000,000' }, { amount: form.amount }).ok).toBe(false);
    expect(planFieldSave(PUB, { nextCycleMonth: 'Smarch' }, { nextCycleMonth: '' }).ok).toBe(false);
  });
  it('keeps the four student-facing settings on a published cycle, not on a draft', () => {
    expect(planFieldSave(PUB, { awardName: ' ' }, { awardName: form.awardName })).toMatchObject({ ok: false, message: NO_BLANK });
    const d = rowToForm(DRAFT);
    expect(planFieldSave(DRAFT, { awardName: '' }, { awardName: d.awardName })).toEqual({ ok: true, columns: { award_name: null } });
  });
  it('asks for the hour with a date', () => {
    expect(patchProblem(rowToForm(DRAFT), { opensDate: '2026-12-01', opensTime: '' }, 'draft')).toMatchObject({ message: NEEDS_HOUR });
  });
  it('compares amounts by cents', () => {
    expect(unchanged(form, { amount: '$2,500.00' })).toBe(true);
    expect(unchanged(form, { amount: '2,501' })).toBe(false);
  });
});
