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
import { cleanRanges, mergeRanges, toMinuteRange, type MinuteRange, type Range } from '../free-ranges';
import { dayLabel, timeLabel } from '../format';
import { sameIds, soonLine, startsSoon, uncoveredFor } from '../interview-cover';
import { saveMyAvailability } from '../interview-flow-db';
import { reassignInterviewer } from '../interview-reassign';
import { sendNeedsCoverEmails, type NeedsCoverItem } from '../email/needs-cover';
import { readInterviews, sessionRole, type Db } from '../pairing-db';
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

/** One interview a save would take the person off: its slot and "Ada Okafor, Thu Nov 12, 5:30 PM". */
export type CoverItem = { slotId: string; line: string };
/** What happened to one of those interviews after the save: "Ada Okafor, Thu Nov 12, 5:30 PM: now with Charlie Gaines". */
export type CoverLine = { text: string; ok: boolean };

export type SaveAvailabilityResult = { ok: true; ranges: Range[]; sentAt: string | null; summary: string[]; cover?: CoverLine[] } | { ok: false; message: string };
export type CoverCheckResult = { ok: true; off: CoverItem[] } | { ok: false; message: string };

/** Said when the interviews a save would take the person off are not the ones they confirmed. Nothing was saved. */
const COVER_CHANGED = 'Your interviews changed. Send again to see which ones this removes.';
const CHECK_FAILED = "Couldn't check your interviews. Try again.";

type Paired = { slotId: string; startsAt: string; endsAt: string; a: string; b: string; applicant: string; code: string };

// The interviews ahead the new free times no longer cover, where `me` is one of the two (read as the person: staff see
// the pairings and names). The ranges are cleaned as the save cleans them (whole half hours, inside the dates, merged).
async function interviewsOff(client: Db, cycle: { id: string; interviewStart: string | null; interviewEnd: string | null }, me: string, ranges: Range[]): Promise<(Paired & { line: string })[]> {
  const window = { start: cycle.interviewStart, end: cycle.interviewEnd };
  const clean = mergeRanges(ranges.map(toMinuteRange).filter((r): r is MinuteRange => r !== null), window);
  const { booked, pairs } = await readInterviews(client, cycle.id);
  const list: Paired[] = [];
  for (const b of booked) {
    const p = pairs.get(b.slotId);
    if (p) list.push({ slotId: b.slotId, startsAt: b.startsAt, endsAt: b.endsAt, a: p.a, b: p.b, applicant: b.applicant, code: b.code });
  }
  return uncoveredFor(me, list, clean, new Date()).map((i) => ({ ...i, line: `${i.applicant}, ${dayLabel(i.startsAt)}, ${timeLabel(i.startsAt)}` }));
}

// Before Send: the interviews these free times would take the signed-in board member off ("This removes you from ...").
// Changes nothing. Mock mode answers with none (the mock page works this out from its own sample).
export async function checkAvailabilityCover(input: { ranges: Range[] }): Promise<CoverCheckResult> {
  if (!hasSupabaseEnv()) return { ok: true, off: [] };
  try {
    const client = await db();
    const me = await sessionRole(client);
    if (!me.id || (me.role !== 'admin' && me.role !== 'board')) return { ok: false, message: MESSAGES['not-allowed'] };
    const cycle = await publishedCycle(client);
    if (!cycle) return { ok: true, off: [] };
    const off = await interviewsOff(client, cycle, me.id, Array.isArray(input?.ranges) ? input.ranges : []);
    return { ok: true, off: off.map((o) => ({ slotId: o.slotId, line: o.line })) };
  } catch {
    return { ok: false, message: CHECK_FAILED };
  }
}

// After a save that took the person off interviews: finds cover for each (lib/interview-reassign.ts, with the service
// role: the person may move only their own seat, and only because their own free time no longer covers it). Nobody
// free: they stay on it, the interview shows "Needs cover" on the Interviews page, and the admins get one email.
// An interview starting within 48 hours is never moved automatically (Rebalance's rule, interview-cover startsSoon):
// they stay on it, it shows "Needs cover", and the admins are emailed the same way.
async function findCover(off: (Paired & { line: string })[], cycleId: string, me: string, client: Db, now: Date): Promise<CoverLine[]> {
  const lines: CoverLine[] = [];
  const uncovered: NeedsCoverItem[] = [];
  const item = (o: Paired, soon: boolean): NeedsCoverItem => ({ slotId: o.slotId, cycleId, outgoingId: me, applicant: o.applicant, code: o.code, when: `${dayLabel(o.startsAt)}, ${timeLabel(o.startsAt)}`, ...(soon ? { soon } : {}) });
  for (const o of off) {
    if (startsSoon(o.startsAt, now)) {
      uncovered.push(item(o, true));
      lines.push({ text: soonLine(o.line), ok: false });
      continue;
    }
    const r = await reassignInterviewer({ slotId: o.slotId, outgoingId: me, why: 'availability_removed' });
    if (r.ok) lines.push({ text: `${o.line}: now with ${r.incomingName}`, ok: true });
    else if (r.reason === 'no_one_free') {
      uncovered.push(item(o, false));
      lines.push({ text: `${o.line}: nobody else is free then yet, so you stay on it for now`, ok: false });
    } else lines.push({ text: `${o.line}: ${r.message}`, ok: false });
  }
  if (uncovered.length > 0) {
    const name = await client.from('staff_profiles').select('display_name').eq('user_id', me).maybeSingle();
    const mail = await sendNeedsCoverEmails(uncovered, (name.data as { display_name: string } | null)?.display_name ?? 'A board member');
    lines.push({ text: mail.sent > 0 || mail.skipped > 0 ? 'The admins have been emailed about the ones still open.' : 'Tell an admin about the ones still open: the email to them did not go out.', ok: mail.sent > 0 || mail.skipped > 0 });
  }
  return lines;
}

// Saves the board member's free times, limit, note and private "students I know". `send` records the time they sent it;
// saving again later keeps it sent. `confirmOff`: the interviews the person agreed to come off (checkAvailabilityCover);
// when the save would take them off a different set, nothing is saved and they are asked to send again. After the save,
// each of those interviews gets cover (`cover` says what happened to each).
export async function saveAvailability(input: { ranges: Range[]; maxInterviews: number | null; text: string; conflicts: string[]; send: boolean; confirmOff?: string[] }): Promise<SaveAvailabilityResult> {
  try {
    if (!hasSupabaseEnv()) {
      const ranges = cleanRanges(input.ranges, { start: MOCK_WINDOW.start, end: MOCK_WINDOW.end });
      return { ok: true, ranges, sentAt: input.send ? new Date().toISOString() : null, summary: describeRanges(ranges) };
    }
    const client = await db();
    const cycle = await publishedCycle(client);
    if (!cycle) return { ok: false, message: 'There is no open cycle.' };
    const me = await sessionRole(client);
    let off: (Paired & { line: string })[] = [];
    if (me.id && (me.role === 'admin' || me.role === 'board') && Array.isArray(input.ranges)) {
      off = await interviewsOff(client, cycle, me.id, input.ranges);
      const agreed = Array.isArray(input.confirmOff) ? input.confirmOff.filter((x): x is string => typeof x === 'string') : [];
      if (!sameIds(off.map((o) => o.slotId), agreed)) return { ok: false, message: COVER_CHANGED };
    }
    const r = await saveMyAvailability(client, cycle.id, input);
    if (!r.ok) return r;
    // The save stands whatever happens next: a problem finding cover is said, never reported as a failed save.
    let cover: CoverLine[] | undefined;
    if (off.length > 0 && me.id) {
      try {
        cover = await findCover(off, cycle.id, me.id, client, new Date());
      } catch {
        cover = [{ text: "Saved, but finding cover didn't finish. Tell an admin which interviews you can't do.", ok: false }];
      }
    }
    return { ok: true, ranges: r.ranges, sentAt: r.sentAt, summary: describeRanges(r.ranges), ...(cover ? { cover } : {}) };
  } catch {
    return { ok: false, message: SAVE_FAILED };
  }
}
