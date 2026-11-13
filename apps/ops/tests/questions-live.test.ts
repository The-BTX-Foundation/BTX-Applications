// Live mode's view builder (lib/questions-live.ts) with a stand-in reader: no published cycle, the next interview, and the
// reads it skips.
import { describe, expect, it, vi } from 'vitest';
import { loadLiveQnView, type QnReader } from '@/lib/questions-live';

const ME = '11111111-1111-4111-8111-111111111111';
const KD = '22222222-2222-4222-8222-222222222222';
const reader = (o: Partial<QnReader> = {}): QnReader => ({
  cycle: async () => ({ id: 'cyc', term: 'Fall 2026' }),
  rubric: async () => [{ key: 'community', name: 'Community', weight: 20, position: 1 }],
  questions: async () => [],
  myPairings: async () => [{ slot_id: 's1', interviewer_a: KD, interviewer_b: ME, interview_slots: { starts_at: '2026-11-12T22:30:00Z', ends_at: '2026-11-12T23:00:00Z' } }],
  bookings: async () => [{ slot_id: 's1', application_id: 'app1' }],
  applications: async () => [{ id: 'app1', applicant_code: 'APP-1', full_name: 'Ada Okafor' }],
  staff: async () => [{ user_id: KD, display_name: 'Keith Dawson' }],
  ...o,
});
const now = new Date('2026-11-10T00:00:00Z');

describe('loadLiveQnView', () => {
  it('builds the view with the next interview', async () => {
    const r = await loadLiveQnView(reader(), ME, true, now);
    expect(r.failed === false && r.next).toEqual({ startsAt: '2026-11-12T22:30:00Z', endsAt: '2026-11-12T23:00:00Z', code: 'APP-1', applicant: 'Ada Okafor', withName: 'Keith Dawson' });
    expect(r.failed === false && r.term).toBe('Fall 2026');
  });
  it('with no published cycle: no questions, no writes, no next-interview reads', async () => {
    const myPairings = vi.fn(async () => []);
    const r = await loadLiveQnView(reader({ cycle: async () => null, myPairings }), ME, true, now);
    if (r.failed) throw new Error('failed');
    expect(r.cycleId).toBeNull();
    expect(r.loadFailed).toBe(false);
    expect(Object.values(r.caps).some(Boolean)).toBe(false);
    expect(myPairings).not.toHaveBeenCalled();
  });
  it('skips the bookings read when the person has no pairings', async () => {
    const bookings = vi.fn(async () => []);
    const r = await loadLiveQnView(reader({ myPairings: async () => [], bookings }), ME, true, now);
    expect(r.failed === false && r.next).toBeNull();
    expect(bookings).not.toHaveBeenCalled();
  });
  it('asks for pairings starting after now', async () => {
    const myPairings = vi.fn(async () => []);
    await loadLiveQnView(reader({ myPairings }), ME, false, now);
    expect(myPairings).toHaveBeenCalledWith('cyc', ME, '2026-11-10T00:00:00.000Z');
  });
});
