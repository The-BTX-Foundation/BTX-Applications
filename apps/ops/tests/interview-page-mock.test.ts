// The page for one interview's sample (mock/interview-page.ts) and loader in mock mode: each ?demo= state, and the sample
// agrees with the Interviews sample (mock/interviews-view.ts) on who, when and the link.
import { describe, expect, it } from 'vitest';
import { loadInterviewPage } from '@/lib/interview-page-loader';
import { mockInterviewPage } from '@/mock/interview-page';
import { INTERVIEWS_VIEW } from '@/mock/interviews-view';

const ok = (slot: string, demo?: string) => {
  const r = mockInterviewPage(slot, demo);
  if (r.state !== 'ok') throw new Error(r.state);
  return r.view;
};

describe('mock interview page', () => {
  it('matches the Interviews sample for every booking', () => {
    for (const b of INTERVIEWS_VIEW.bookings) {
      const v = ok(b.id);
      expect(v.name).toBe(b.name);
      expect(v.code).toBe(b.code);
      expect(v.pair.map((p) => p.id)).toEqual(b.pair.map((p) => p.id));
      expect(v.link).toBe(b.link);
    }
  });
  it('Ada has questions and the other interviewer\'s notes', () => {
    const v = ok('t6');
    expect(v.groups.length).toBeGreaterThan(0);
    expect(Object.keys(v.others).length).toBeGreaterThan(0);
    expect(v.caps.notes).toBe(true);
  });
  it('error and failed fail; an unknown slot is missing', () => {
    expect(mockInterviewPage('t6', 'error').state).toBe('failed');
    expect(mockInterviewPage('t6', 'failed').state).toBe('failed');
    expect(mockInterviewPage('nope').state).toBe('missing');
  });
  it('empty: no questions and nobody paired', () => {
    const v = ok('t6', 'empty');
    expect(v.groups).toEqual([]);
    expect(v.pair).toEqual([]);
  });
  it('stress: longer names and more questions than normal', () => {
    const n = ok('t6');
    const s = ok('t6', 'stress');
    expect(s.name.length).toBeGreaterThan(n.name.length);
    expect(s.groups.flatMap((g) => g.questions).length).toBeGreaterThan(n.groups.flatMap((g) => g.questions).length);
  });
  it('board on someone else\'s interview: the link is hidden and no notes', () => {
    const lena = INTERVIEWS_VIEW.bookings.find((b) => b.name === 'Lena Mensah')!;
    const v = ok(lena.id, 'board');
    expect(v.isAdmin).toBe(false);
    expect(v.link).toBeNull();
    expect(v.linkHidden).toBe(true);
    expect(v.caps.notes).toBe(false);
  });
  it('the loader uses the sample without Supabase env', async () => {
    expect((await loadInterviewPage({ slotId: 't6', demo: undefined, me: null, isAdmin: true }, false)).state).toBe('ok');
    expect((await loadInterviewPage({ slotId: 't6', demo: 'error', me: null, isAdmin: true }, false)).state).toBe('failed');
  });
});
