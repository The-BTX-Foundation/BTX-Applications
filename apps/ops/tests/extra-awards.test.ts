import { beforeEach, describe, expect, it } from 'vitest';
import { addRefusal, agendaDone, AGENDA_STEPS, checkExtraAward, dollarsToCents } from '@/lib/award-input';
import { recordAward } from '@/lib/actions/selection';
import { selectionStore } from '@/mock/selection';

// Mock mode (no Supabase env in the tests): recordAward writes to the in-memory store.
const extra = (code: string, awardName: string, amountCents: number) => ({ cycleId: null, applicationId: `mock-${code}`, code, name: `Person ${code}`, kind: 'extra' as const, awardName, amountCents, note: '' });

beforeEach(() => {
  const st = selectionStore();
  st.awards = [];
  st.releasedAt = null;
});

describe('extra awards (recordAward, mock mode)', () => {
  it('records two extras with different names and amounts', async () => {
    expect((await recordAward(extra('A1', 'Empowerment Award', 50000))).ok).toBe(true);
    expect((await recordAward(extra('A2', '  Persistence Award ', 25000))).ok).toBe(true);
    expect(selectionStore().awards.map((a) => [a.awardName, a.amountCents])).toEqual([
      ['Empowerment Award', 50000],
      ['Persistence Award', 25000],
    ]);
  });

  it('refuses a second award for the same applicant', async () => {
    await recordAward(extra('A1', 'Empowerment Award', 50000));
    const r = await recordAward(extra('A1', 'Persistence Award', 25000));
    expect(r).toEqual({ ok: false, message: 'That applicant already has an award.' });
    expect(selectionStore().awards).toHaveLength(1);
  });

  it('refuses an empty or blank name', async () => {
    for (const n of ['', '   ']) expect(await recordAward(extra('A1', n, 50000))).toEqual({ ok: false, message: 'Give the award a name.' });
    expect(selectionStore().awards).toHaveLength(0);
  });

  it('refuses a name over 120 characters', async () => {
    expect((await recordAward(extra('A1', 'x'.repeat(121), 50000))).message).toBe('Give the award a name.');
    expect((await recordAward(extra('A1', 'x'.repeat(120), 50000))).ok).toBe(true);
  });

  it('refuses a 0, negative or non-integer amount', async () => {
    for (const c of [0, -100, 50.5, NaN, 99, 10_000_001]) expect(await recordAward(extra('A1', 'Empowerment Award', c))).toEqual({ ok: false, message: 'Enter an amount in dollars.' });
    expect(selectionStore().awards).toHaveLength(0);
  });

  it('refuses adding after decisions are released', async () => {
    selectionStore().releasedAt = '2026-10-23T14:00:00Z';
    const r = await recordAward(extra('A1', 'Empowerment Award', 50000));
    expect(r).toEqual({ ok: false, message: "Decisions have gone out, so awards can't be added here." });
  });
});

describe('award-input rules', () => {
  it('trims the name and accepts the limits', () => {
    expect(checkExtraAward({ awardName: ' Empowerment Award ', amountCents: 100 })).toEqual({ ok: true, awardName: 'Empowerment Award' });
    expect(checkExtraAward({ awardName: 'x', amountCents: 10_000_000 }).ok).toBe(true);
  });
  it('reads whole dollars as cents', () => {
    expect(dollarsToCents('500')).toBe(50000);
    expect(dollarsToCents('1,500')).toBe(150000);
    expect([dollarsToCents(''), dollarsToCents('12.50'), dollarsToCents('-5'), dollarsToCents('abc')].every(Number.isNaN)).toBe(true);
  });
  it('allows adding until the release time is set', () => {
    expect(addRefusal(null)).toBeNull();
    expect(addRefusal('2026-10-23T14:00:00Z')).toBe("Decisions have gone out, so awards can't be added here.");
  });
  it('the step counter ignores extras: only the main award counts', () => {
    expect(AGENDA_STEPS).toBe(2);
    expect(agendaDone(false)).toBe(0);
    expect(agendaDone(true)).toBe(1);
  });
});
