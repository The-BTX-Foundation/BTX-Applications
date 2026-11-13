// The Availability save's cover step (lib/actions/availability.ts): an interview starting within 48 hours is never
// reassigned automatically (Rebalance's rule). The member stays on it, the admins are emailed ("Needs cover"), and the
// page says so. Interviews further ahead still get cover found.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = new Date('2026-11-13T15:00:00Z');
const at = (hoursAhead: number) => new Date(NOW.getTime() + hoursAhead * 3_600_000).toISOString();
const plus30 = (iso: string) => new Date(Date.parse(iso) + 30 * 60_000).toISOString();

const st = vi.hoisted(() => ({
  booked: [] as { slotId: string; startsAt: string; endsAt: string; applicant: string; code: string }[],
  reassigned: [] as unknown[],
  needsCover: [] as unknown[][],
}));

vi.mock('@btx/data', () => ({ hasSupabaseEnv: () => true }));
vi.mock('@btx/ai', () => ({ describeRanges: () => [], readFreeTimes: vi.fn(), MAX_TEXT: 2000 }));
vi.mock('@/lib/supabase-server', () => ({
  sessionClient: async () => ({
    from: () => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { display_name: 'Ada Lee' }, error: null }) };
      return q;
    },
  }),
}));
vi.mock('@/lib/availability', () => ({
  MOCK_WINDOW: { start: '2026-11-10', end: '2026-11-20' },
  publishedCycle: async () => ({ id: 'c1', term: 'Fall 2026', awardName: 'Legacy', closesAt: null, interviewStart: '2026-11-10', interviewEnd: '2026-11-20' }),
}));
vi.mock('@/lib/pairing-db', () => ({
  sessionRole: async () => ({ id: 'me', role: 'board' }),
  readInterviews: async () => ({
    booked: st.booked.map((b) => ({ ...b, applicationId: `a-${b.slotId}` })),
    pairs: new Map(st.booked.map((b) => [b.slotId, { a: 'me', b: 'other' }])),
  }),
}));
vi.mock('@/lib/interview-flow-db', () => ({ saveMyAvailability: async () => ({ ok: true, ranges: [], sentAt: null }) }));
vi.mock('@/lib/interview-reassign', () => ({
  reassignInterviewer: vi.fn(async (input: unknown) => {
    st.reassigned.push(input);
    return { ok: true, incomingId: 'u3', incomingName: 'Bo Kim' };
  }),
}));
vi.mock('@/lib/email/needs-cover', () => ({
  sendNeedsCoverEmails: vi.fn(async (...a: unknown[]) => {
    st.needsCover.push(a);
    return { sent: 2, skipped: 0, failed: 0, notConfigured: false };
  }),
}));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  st.booked = [];
  st.reassigned = [];
  st.needsCover = [];
});
afterEach(() => vi.useRealTimers());

describe('saveAvailability cover: the 48-hour rule', () => {
  it('keeps an interview starting within 48 hours with the member, tells the admins, and still covers later ones', async () => {
    const soon = at(20);
    const later = at(72);
    st.booked = [
      { slotId: 'soon', startsAt: soon, endsAt: plus30(soon), applicant: 'Ada Okafor', code: 'APP-1' },
      { slotId: 'later', startsAt: later, endsAt: plus30(later), applicant: 'Ben Cole', code: 'APP-2' },
    ];
    const { saveAvailability } = await import('@/lib/actions/availability');
    // No free times at all: both interviews come off, and the member confirmed both.
    const r = await saveAvailability({ ranges: [], maxInterviews: null, text: '', conflicts: [], send: true, confirmOff: ['soon', 'later'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Only the later one is reassigned.
    expect(st.reassigned).toEqual([{ slotId: 'later', outgoingId: 'me', why: 'availability_removed' }]);
    // The soon one goes to the admins as needs-cover, marked soon, with the member's id.
    expect(st.needsCover).toHaveLength(1);
    expect(st.needsCover[0][0]).toEqual([expect.objectContaining({ slotId: 'soon', cycleId: 'c1', outgoingId: 'me', applicant: 'Ada Okafor', soon: true })]);
    expect(st.needsCover[0][1]).toBe('Ada Lee');
    const texts = (r.cover ?? []).map((l) => l.text);
    expect(texts[0]).toMatch(/^Ada Okafor, .+: starts soon, so you stay on it\. An admin has been told\.$/);
    expect(texts[1]).toMatch(/^Ben Cole, .+: now with Bo Kim$/);
    expect(texts[2]).toBe('The admins have been emailed about the ones still open.');
  });

  it('just past 48 hours is reassigned as before', async () => {
    const s = at(48.5);
    st.booked = [{ slotId: 's', startsAt: s, endsAt: plus30(s), applicant: 'Ada Okafor', code: 'APP-1' }];
    const { saveAvailability } = await import('@/lib/actions/availability');
    const r = await saveAvailability({ ranges: [], maxInterviews: null, text: '', conflicts: [], send: true, confirmOff: ['s'] });
    expect(r.ok).toBe(true);
    expect(st.reassigned).toHaveLength(1);
    expect(st.needsCover).toEqual([]);
  });
});
