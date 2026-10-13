'use server';

// Write actions for Interviews > Your availability. Each runs as the signed-in board member, so row-level security
// applies; the checks here turn a refusal into a plain message. In mock mode (no Supabase env) they change nothing.
//
// The AI reader runs here only: it needs ANTHROPIC_API_KEY (BTX has none yet, so it answers "not-configured" and the
// screen asks the person to fill the grid by hand).
import { describeRanges, readFreeTimes, MAX_TEXT } from '@btx/ai';
import { hasSupabaseEnv } from '@btx/data';
import { easternIso } from '../cycle-core';
import { MOCK_WINDOW, publishedCycle } from '../availability';
import { cleanRanges, type Range } from '../free-ranges';
import { saveMyAvailability } from '../interview-flow-db';
import { sessionRole, type Db } from '../pairing-db';
import { sessionClient } from '../supabase-server';

const SAVE_FAILED = "That didn't save. Try again.";
const db = async () => (await sessionClient()) as unknown as Db;

export type TypedReadResult =
  | { ok: true; ranges: Range[]; unread: string[] }
  | { ok: false; reason: 'empty' | 'too-long' | 'unreadable' | 'failed' | 'not-configured' | 'limit' | 'not-allowed' | 'no-dates'; message: string };

const MESSAGES = {
  unreadable: "I couldn't read that. Try something like 'weekdays after 5'.",
  failed: "I couldn't read that just now. Pick a quick time below or fill in the grid by hand.",
  'not-configured': "I couldn't read that just now. Pick a quick time below or fill in the grid by hand.",
  'too-long': `That's too long. Keep it under ${MAX_TEXT.toLocaleString('en-US')} characters, or fill in the grid by hand.`,
  empty: 'Type when you are free first.',
  limit: "You've used the reader a lot today. Fill in the times by hand.",
  'not-allowed': 'Only board members can give interview availability.',
  'no-dates': "The interview dates aren't set yet.",
} as const;
const no = (reason: keyof typeof MESSAGES): TypedReadResult => ({ ok: false, reason, message: MESSAGES[reason] });

// Reads what the board member typed ("weekdays after 6") into free times inside the interview dates. Checks they are a
// board member and under 30 reads today before calling the reader.
export async function readTypedAvailability(text: string): Promise<TypedReadResult> {
  const typed = typeof text === 'string' ? text : '';
  if (typed.trim() === '') return no('empty');
  if (typed.length > MAX_TEXT) return no('too-long');
  let window: { start: string; end: string };
  if (!hasSupabaseEnv()) window = MOCK_WINDOW;
  else {
    try {
      const client = await db();
      const me = await sessionRole(client);
      if (!me.id || (me.role !== 'admin' && me.role !== 'board')) return no('not-allowed');
      const cycle = await publishedCycle(client);
      if (!cycle?.interviewStart || !cycle.interviewEnd) return no('no-dates');
      window = { start: cycle.interviewStart, end: cycle.interviewEnd };
      const taken = await client.rpc('ai_take', { p_kind: 'availability', p_daily_limit: 30 });
      if (taken.error) return no('failed');
      if (taken.data !== true) return no('limit');
    } catch {
      return no('failed');
    }
  }
  const r = await readFreeTimes({ text: typed, windowStart: window.start, windowEnd: window.end, today: easternIso(new Date().toISOString()), audience: 'board' });
  if (!r.ok) return no(r.reason);
  return { ok: true, ranges: r.ranges, unread: r.unread };
}

export type SaveAvailabilityResult = { ok: true; ranges: Range[]; sentAt: string | null; summary: string[] } | { ok: false; message: string };

// Saves the board member's free times, limit, note and private "students I know". `send` records the time they sent it;
// saving again later keeps it sent.
export async function saveAvailability(input: { ranges: Range[]; maxInterviews: number | null; text: string; conflicts: string[]; send: boolean }): Promise<SaveAvailabilityResult> {
  try {
    if (!hasSupabaseEnv()) {
      const ranges = cleanRanges(input.ranges, { start: MOCK_WINDOW.start, end: MOCK_WINDOW.end });
      return { ok: true, ranges, sentAt: input.send ? new Date().toISOString() : null, summary: describeRanges(ranges) };
    }
    const client = await db();
    const cycle = await publishedCycle(client);
    if (!cycle) return { ok: false, message: 'There is no open cycle.' };
    const r = await saveMyAvailability(client, cycle.id, input);
    if (!r.ok) return r;
    return { ok: true, ranges: r.ranges, sentAt: r.sentAt, summary: describeRanges(r.ranges) };
  } catch {
    return { ok: false, message: SAVE_FAILED };
  }
}
