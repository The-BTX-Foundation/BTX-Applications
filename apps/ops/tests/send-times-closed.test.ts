// "Send times" (actions/interviews.ts sendTimes) when booking has closed: the times were opened first, so the refusal
// message says so too. Everything outside the action is faked.
import { describe, expect, it, vi } from 'vitest';

const st = vi.hoisted(() => ({ invite: { ok: false, reason: 'booking-closed', closedOn: 'Nov 13' } as unknown }));
vi.mock('@btx/data', () => ({ hasSupabaseEnv: () => true }));
vi.mock('@/lib/supabase-server', () => ({ sessionClient: async () => ({}) }));
vi.mock('@/lib/interview-flow-db', () => ({
  addTime: vi.fn(), openProposedTimes: vi.fn(async () => ({ ok: true })), rebalanceInterviews: vi.fn(), rebuildProposedTimes: vi.fn(), removeTime: vi.fn(),
}));
vi.mock('@/lib/email/send', () => ({ sendBookingInvites: vi.fn(async () => st.invite) }));

import { sendTimes } from '@/lib/actions/interviews';

describe('sendTimes after the booking deadline', () => {
  it('says the times are open in the Portal as well as the refusal', async () => {
    const r = await sendTimes('c1');
    expect(r).toEqual({ ok: false, message: 'Booking closed on Nov 13. No emails went out. The times are open in the Portal.', emailed: 0, notConfigured: false });
  });
});
