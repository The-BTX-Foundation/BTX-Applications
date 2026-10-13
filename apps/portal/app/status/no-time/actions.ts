'use server';

// Reads what a student typed about when she is free and gives back time ranges she can fix. Server only: the reader
// needs a key that must never reach the browser. Nothing here saves anything; Send saves (saveFreeRanges).
import { readFreeTimes, MAX_TEXT, type Range } from '@btx/ai';
import { fetchPublishedCycle, getAuthMode } from '@btx/data';
import { MOCK_VIEW } from '@/lib/cycle';
import { easternDate } from '@/lib/format';
import { freeWindow } from '@/lib/journey';
import { sessionClient } from '@/lib/supabase-server';

/** 'limit' = she used the reader 10 times today; 'unread' = not set up, could not read it, or it failed. */
export type ReadFreeTimesResult = { ok: true; ranges: Range[] } | { ok: false; reason: 'limit' | 'unread' };

const UNREAD: ReadFreeTimesResult = { ok: false, reason: 'unread' };
const DAILY_READS = 10;

export async function readStudentFreeTimes(text: string): Promise<ReadFreeTimesResult> {
  try {
    if (typeof text !== 'string' || text.trim() === '' || text.length > MAX_TEXT) return UNREAD;

    let start: string;
    let end: string;
    let today: string;
    if (getAuthMode() === 'mock') {
      // no database: the sample cycle, on the day the demos are drawn
      today = '2026-09-15';
      ({ start, end } = freeWindow(today, MOCK_VIEW.drawing?.interviewStart ?? null, MOCK_VIEW.drawing?.interviewEnd ?? null));
    } else {
      const client = await sessionClient();
      const { data: auth } = await client.auth.getUser();
      if (!auth.user) return UNREAD;
      const { cycle } = await fetchPublishedCycle(client);
      if (!cycle) return UNREAD;
      const { data: app } = await client.from('applications').select('status').eq('cycle_id', cycle.id).maybeSingle();
      if (!app || app.status !== 'submitted') return UNREAD;
      // no reader set up: say so without using up one of her reads
      if (!process.env.ANTHROPIC_API_KEY && !(process.env.BTX_AI_FAKE === '1' && process.env.NODE_ENV !== 'production')) return UNREAD;
      // one use of the daily limit (the database only allows letters and underscores in the kind, so not "free-times"), counted whether or not the text turns out readable
      const taken = await (client as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> }).rpc('ai_take', {
        p_kind: 'free_times',
        p_daily_limit: DAILY_READS,
      });
      if (taken.error) return UNREAD;
      if (taken.data !== true) return { ok: false, reason: 'limit' };
      today = easternDate(new Date());
      ({ start, end } = freeWindow(today, cycle.interview_start, cycle.interview_end));
    }

    const r = await readFreeTimes({ text, windowStart: start, windowEnd: end, today, audience: 'student' });
    return r.ok ? { ok: true, ranges: r.ranges } : UNREAD;
  } catch {
    return UNREAD;
  }
}
