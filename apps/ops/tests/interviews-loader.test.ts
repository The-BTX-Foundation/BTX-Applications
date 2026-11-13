// The Interviews loader in live mode (docs/DESIGN-DNA.md, "Mock-only demo flags"): with Supabase env present, every
// ?demo= value is ignored, the existing loader is called with no options (so no demo flag reaches it), and the mock-only
// controls stay off. A failed read is a load error (never zeros), logged with the table and a code only, no names.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InterviewsData } from '@/lib/interviews';

const st = vi.hoisted(() => ({ failed: false, calls: [] as unknown[][] }));

vi.mock('@btx/data', () => ({ hasSupabaseEnv: () => true }));
vi.mock('@/lib/me', () => ({ currentStaffId: async () => 'u-me' }));
vi.mock('@/lib/interviews', () => ({
  // A stand-in for the existing loader: records its arguments and returns one live booking.
  loadInterviews: async (...args: unknown[]) => {
    st.calls.push(args);
    const data: InterviewsData = {
      cycleId: 'cy1',
      sub: '',
      subPhone: '',
      endsLabel: '',
      done: 0,
      total: 1,
      upcoming: [{ slotId: 's1', weekday: 'Tue', dayNum: '10', time: '6:00 PM', whenLine: 'Tue Nov 10, 6:00 PM', code: 'BTX-1', applicant: 'Sade Price', pair: [], mine: false, videoUrl: null, when: 'Today' }],
      bookedCount: 1,
      applicantCount: 1,
      pairs: [],
      times: null,
      fair: null,
      isAdmin: true,
      failed: st.failed,
      source: 'live',
    };
    return data;
  },
}));

afterEach(() => {
  st.failed = false;
  st.calls = [];
  vi.restoreAllMocks();
});

describe('loadInterviewsView in live mode', () => {
  it.each(['failed', 'error', 'stress', 'empty', 'loading', undefined])('ignores ?demo=%s: real data, no load error, mock-only controls off', async (demo) => {
    const { loadInterviewsView } = await import('@/lib/interviews-view-loader');
    const v = await loadInterviewsView({ demo });
    expect(st.calls).toEqual([[]]);
    expect(v.source).toBe('live');
    expect(v.failed).toBe(false);
    expect(v.loadError).toBe(false);
    expect(v.bookings.map((b) => b.code)).toEqual(['BTX-1']);
    expect([v.caps.undoTime, v.caps.nudge]).toEqual([false, false]);
    expect(v.unbooked).toBeNull();
  });

  it('a failed read is the load-error view, logged with table and code only', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    st.failed = true;
    const { loadInterviewsView } = await import('@/lib/interviews-view-loader');
    const v = await loadInterviewsView({ demo: 'stress' });
    expect(v.failed).toBe(true);
    expect(v.bookings).toEqual([]);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('[interviews] read failed', { table: 'interviews', code: 'load' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('Sade');
  });
});
