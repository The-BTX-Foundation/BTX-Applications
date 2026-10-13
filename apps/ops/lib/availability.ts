// Interviews > Your availability: the page's data. LIVE: the newest published cycle (the same pick as lib/pairing-db.ts
// currentCycle) and the signed-in board member's own availability (lib/interview-flow-db.ts readMyAvailability).
// MOCK (no Supabase env): the Figma sample, Tue Nov 10 to Fri Nov 20. Server only: describeRanges comes from @btx/ai,
// which the browser must never load.
import { describeRanges } from '@btx/ai';
import { hasSupabaseEnv } from '@btx/data';
import { readMyAvailability, type MyAvailability } from './interview-flow-db';
import { dateOnlyLabel } from './format';
import { easternIso } from './cycle-core';
import { windowDays, type Range } from './free-ranges';
import type { Db } from './pairing-db';
import { sessionClient } from './supabase-server';

export type CycleForAvailability = { id: string; term: string; awardName: string | null; closesAt: string | null; interviewStart: string | null; interviewEnd: string | null };

export type AvailabilityPageData = {
  failed: boolean;
  source: 'live' | 'mock';
  /** The cycle has no interview dates (or there is no cycle), so there is no grid. */
  noDates: boolean;
  /** "Fall 2026 Legacy Scholarship". */
  cycleName: string;
  /** "Tue Nov 10 to Fri Nov 20" and "Nov 10 to Nov 20" (phone). */
  windowText: string;
  windowShort: string;
  /** "Fri Nov 6": when the cycle closes (Eastern), or ''. */
  dueText: string;
  days: string[];
  initial: MyAvailability;
  /** One plain line per day for what is saved ("Tue Nov 10: 5:00 to 9:00 PM"). */
  summary: string[];
};

const EMPTY: MyAvailability = { ranges: [], maxInterviews: null, text: '', sentAt: null, conflicts: [] };

/** The newest published cycle, with what this page needs. */
export async function publishedCycle(db: Db): Promise<CycleForAvailability | null> {
  const r = await db.from('cycles').select('id, term, award_name, closes_at, interview_start, interview_end').eq('status', 'published').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (r.error) throw r.error;
  if (!r.data) return null;
  return { id: r.data.id, term: r.data.term, awardName: r.data.award_name, closesAt: r.data.closes_at, interviewStart: r.data.interview_start, interviewEnd: r.data.interview_end };
}

const MOCK_CYCLE: CycleForAvailability = { id: 'mock-cycle', term: 'Fall 2026', awardName: 'Legacy Scholarship', closesAt: '2026-11-07T04:59:00Z', interviewStart: '2026-11-10', interviewEnd: '2026-11-20' };

const evening = (day: string): Range => ({ day, start: '17:00', end: '21:00' });
const MOCK_AVAILABILITY: MyAvailability = {
  ranges: [evening('2026-11-11'), evening('2026-11-13'), { day: '2026-11-14', start: '10:00', end: '14:00' }, ...['16', '17', '18', '19', '20'].map((d) => evening(`2026-11-${d}`))],
  maxInterviews: 5,
  text: 'Weekdays after 5 except Tuesday and Thursday next week. Saturday 10 to 2.',
  sentAt: null,
  conflicts: ['Jordan Pierce', 'Amara Okafor'],
};

function build(cycle: CycleForAvailability | null, initial: MyAvailability, source: 'live' | 'mock'): AvailabilityPageData {
  const days = cycle ? windowDays(cycle.interviewStart, cycle.interviewEnd) : [];
  const first = days[0] ?? '';
  const last = days[days.length - 1] ?? '';
  const short = (d: string) => dateOnlyLabel(d).replace(/^\w+ /, '');
  return {
    failed: false,
    source,
    noDates: days.length === 0,
    cycleName: cycle ? [cycle.term, cycle.awardName].filter(Boolean).join(' ') : '',
    windowText: days.length ? `${dateOnlyLabel(first)} to ${dateOnlyLabel(last)}` : '',
    windowShort: days.length ? `${short(first)} to ${short(last)}` : '',
    dueText: cycle?.closesAt ? dateOnlyLabel(easternIso(cycle.closesAt)) : '',
    days,
    initial,
    summary: describeRanges(initial.ranges),
  };
}

export async function loadAvailability(opts: { demo?: string } = {}): Promise<AvailabilityPageData> {
  if (!hasSupabaseEnv()) {
    if (opts.demo === 'error') return { ...build(MOCK_CYCLE, EMPTY, 'mock'), failed: true };
    if (opts.demo === 'nodates') return build({ ...MOCK_CYCLE, interviewStart: null, interviewEnd: null }, EMPTY, 'mock');
    if (opts.demo === 'empty') return build(MOCK_CYCLE, { ...EMPTY, conflicts: [] }, 'mock');
    if (opts.demo === 'sent') return build(MOCK_CYCLE, { ...MOCK_AVAILABILITY, sentAt: '2026-11-02T23:14:00Z' }, 'mock');
    return build(MOCK_CYCLE, MOCK_AVAILABILITY, 'mock');
  }
  try {
    const db = (await sessionClient()) as unknown as Db;
    const cycle = await publishedCycle(db);
    if (!cycle) return build(null, EMPTY, 'live');
    if (!cycle.interviewStart || !cycle.interviewEnd) return build(cycle, EMPTY, 'live');
    const mine = await readMyAvailability(db, cycle.id);
    if (!mine.ok) return { ...build(cycle, EMPTY, 'live'), failed: true };
    return build(cycle, mine.availability, 'live');
  } catch {
    return { ...build(null, EMPTY, 'live'), failed: true };
  }
}

/** The mock cycle's interview dates, for the server actions in mock mode. */
export const MOCK_WINDOW = { start: MOCK_CYCLE.interviewStart as string, end: MOCK_CYCLE.interviewEnd as string };
