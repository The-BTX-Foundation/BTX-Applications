// Scholarships > Interviews: the interviews left this week and the table of interviewer pairs.
// REAL in live mode: the booked slots (`bookings` + `interview_slots`), the applicant's code and initials
// (`applications`) and the cycle's interview end date (`cycles`).
// MOCK (mock/interviews.ts, mock/staff.ts): who interviews (the draft table `interview_pairings`), their names
// (`staff_profiles`) and the video link. In mock mode everything comes from the fixtures.
// Going live later = replace pairingFor() with a read of `interview_pairings`; the page does not change.
import { hasSupabaseEnv } from '@btx/data';
import { currentStaffId } from './me';
import { dateOnlyLabel, dayLabel, dottedInitials, timeLabel } from './format';
import { sessionClient } from './supabase-server';
import { MOCK_APPLICANTS, MOCK_NOW } from '@/mock/applicants';
import { pairingFor } from '@/mock/interviews';
import { staffById, type StaffProfile } from '@/mock/staff';

export type Interviewer = { userId: string; name: string; initials: string };

export type UpcomingInterview = {
  slotId: string;
  /** "Mon", "5", "10:00 AM". */
  weekday: string;
  dayNum: string;
  time: string;
  code: string;
  /** Dotted initials, "S.P.". */
  initials: string;
  /** The two interviewers; empty when nobody is paired yet ("Unassigned"). */
  pair: Interviewer[];
  /** The signed-in person is one of the two. */
  mine: boolean;
  videoUrl: string | null;
  /** "Tomorrow", "In 2 days". */
  when: string;
};

export type PairRow = { key: string; names: string; done: number; left: number; next: string };

export type InterviewsData = {
  /** "Interviews end Fri Oct 9 · all on video". */
  sub: string;
  /** "ends Fri Oct 9" (phone). */
  endsLabel: string;
  done: number;
  total: number;
  upcoming: UpcomingInterview[];
  pairs: PairRow[];
  /** Admins may re-run pairing. */
  isAdmin: boolean;
  failed: boolean;
  source: 'live' | 'mock';
};

type Booking = { slotId: string; startsAt: string; code: string; initials: string };

const toInterviewer = (s: StaffProfile): Interviewer => ({ userId: s.user_id, name: s.display_name, initials: s.initials });

// "Tomorrow", "In 2 days" or "Today", by Eastern calendar days from now.
function whenLabel(startsAt: string, now: Date): string {
  const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
  const a = Date.parse(ymd(now));
  const b = Date.parse(ymd(new Date(startsAt)));
  const days = Math.round((b - a) / 86_400_000);
  return days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
}

// Builds the page data from booked interviews (shared by mock and live mode).
function build(bookings: Booking[], now: Date, endISO: string | null, meId: string | null, isAdmin: boolean, source: 'live' | 'mock'): InterviewsData {
  const sorted = [...bookings].sort((x, y) => x.startsAt.localeCompare(y.startsAt));
  const past = sorted.filter((b) => new Date(b.startsAt) <= now);
  const future = sorted.filter((b) => new Date(b.startsAt) > now);
  const resolve = (code: string): Interviewer[] => {
    const pr = pairingFor(code);
    if (!pr) return [];
    const a = staffById(pr.interviewer_a);
    const b = staffById(pr.interviewer_b);
    return a && b ? [toInterviewer(a), toInterviewer(b)] : [];
  };

  const upcoming: UpcomingInterview[] = future.map((b) => {
    const pair = resolve(b.code);
    const wk = dayLabel(b.startsAt).split(' ');
    return {
      slotId: b.slotId,
      weekday: wk[0],
      dayNum: wk[2],
      time: timeLabel(b.startsAt),
      code: b.code,
      initials: b.initials,
      pair,
      mine: meId !== null && pair.some((i) => i.userId === meId),
      videoUrl: pairingFor(b.code)?.video_url ?? null,
      when: whenLabel(b.startsAt, now),
    };
  });

  // One row per pair: interviews done, interviews left, and the next one.
  const rows = new Map<string, { names: string; done: number; left: number; next: string | null; nextAt: string; }>();
  const touch = (b: Booking, isDone: boolean) => {
    const pair = resolve(b.code);
    if (pair.length !== 2) return;
    const key = `${pair[0].userId}+${pair[1].userId}`;
    const row = rows.get(key) ?? { names: `${pair[0].name} + ${pair[1].name}`, done: 0, left: 0, next: null, nextAt: '' };
    if (isDone) row.done += 1;
    else {
      row.left += 1;
      if (row.next === null) {
        row.next = dayLabel(b.startsAt);
        row.nextAt = b.startsAt;
      }
    }
    rows.set(key, row);
  };
  past.forEach((b) => touch(b, true));
  future.forEach((b) => touch(b, false));
  const pairs: PairRow[] = [...rows.entries()]
    // most interviews done first, then pairs with interviews left, then the soonest next interview
    .sort(([, x], [, y]) => y.done - x.done || Number(x.left === 0) - Number(y.left === 0) || x.nextAt.localeCompare(y.nextAt))
    .map(([key, r]) => ({ key, names: r.names, done: r.done, left: r.left, next: r.next ?? 'Done' }));

  const end = endISO ? dateOnlyLabel(endISO) : '';
  return {
    sub: end ? `Interviews end ${end} · all on video` : 'All on video',
    endsLabel: end ? `ends ${end}` : '',
    done: past.length,
    total: sorted.length,
    upcoming,
    pairs,
    isAdmin,
    failed: false,
    source,
  };
}

// The stress frame's data (Figma "Scholarships > Interviews, stress"): 120 applicants, long codes and initials, an
// unassigned interview and a pair whose next date is far off. Shown with ?demo=stress.
function stress(): InterviewsData {
  const kd = toInterviewer(staffById('mock-staff-kd')!);
  const tf = toInterviewer(staffById('mock-staff-tf')!);
  const ck = toInterviewer(staffById('mock-staff-ck')!);
  const ds = toInterviewer(staffById('mock-staff-ds')!);
  const dm = toInterviewer(staffById('mock-staff-dm')!);
  const cg = toInterviewer(staffById('mock-staff-cg')!);
  const row = (r: Omit<UpcomingInterview, 'slotId' | 'videoUrl'>, i: number): UpcomingInterview => ({ ...r, slotId: `stress-${i}`, videoUrl: r.pair.length ? 'https://meet.example.org/btx/stress' : null });
  return {
    sub: 'Interviews end Fri Oct 9 · all on video',
    endsLabel: 'ends Fri Oct 9',
    done: 116,
    total: 120,
    upcoming: [
      row({ weekday: 'Mon', dayNum: '5', time: '8:00 AM', code: 'APP-2026-00120', initials: 'A-G.O.', pair: [kd, tf], mine: false, when: 'Tomorrow' }, 1),
      row({ weekday: 'Tue', dayNum: '6', time: '9:30 PM', code: 'APP-2026-00119', initials: 'J-M.A.', pair: [ck, ds], mine: false, when: 'In 2 days' }, 2),
      row({ weekday: 'Wed', dayNum: '7', time: '12:00 PM', code: 'APP-2026-00017', initials: 'F.N.', pair: [dm, cg], mine: true, when: 'In 3 days' }, 3),
      row({ weekday: 'Thu', dayNum: '8', time: '7:00 PM', code: 'APP-2026-00118', initials: 'B.R.', pair: [], mine: false, when: 'In 4 days' }, 4),
    ],
    pairs: [
      { key: 'a', names: 'Dania Morris + Chariah Ghee', done: 106, left: 1, next: 'Wed Sep 30' },
      { key: 'b', names: 'Kelsey Davis + Tomi Falodun', done: 3, left: 1, next: 'Mon Oct 5' },
      { key: 'c', names: 'Cillisha Knights + Darien Strachan', done: 2, left: 1, next: 'Tue Oct 6' },
      { key: 'd', names: 'Marcus Davis + Kelsey Davis', done: 2, left: 1, next: 'Thu Dec 31' },
      { key: 'e', names: 'Tomi Falodun + Darien Strachan', done: 2, left: 0, next: 'Done' },
      { key: 'f', names: 'Dania Morris + Marcus Davis', done: 1, left: 0, next: 'Done' },
    ],
    isAdmin: true,
    failed: false,
    source: 'mock',
  };
}

// Loads the interviews page. A failed query returns failed: true instead of throwing.
export async function loadInterviews(opts: { forceError?: boolean; stress?: boolean } = {}): Promise<InterviewsData> {
  const me = await currentStaffId();
  if (!hasSupabaseEnv()) {
    if (opts.forceError) return { ...build([], new Date(MOCK_NOW), null, me, true, 'mock'), failed: true };
    if (opts.stress) return stress();
    const bookings: Booking[] = MOCK_APPLICANTS.filter((a) => a.interviewAt).map((a) => ({
      slotId: `mock-slot-${a.code}`,
      startsAt: a.interviewAt as string,
      code: a.code,
      initials: a.initials,
    }));
    return build(bookings, new Date(MOCK_NOW), '2026-10-09', me, true, 'mock');
  }
  try {
    const client = await sessionClient();
    const cycle = await client.from('cycles').select('id, interview_end').eq('status', 'published').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (cycle.error) throw cycle.error;
    if (!cycle.data) return build([], new Date(), null, me, false, 'live');
    const rows = await client
      .from('bookings')
      .select('slot_id, interview_slots!inner(starts_at, cycle_id), applications!inner(applicant_code, full_name)')
      .eq('status', 'active')
      .eq('interview_slots.cycle_id', cycle.data.id);
    if (rows.error) throw rows.error;
    const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
    const bookings: Booking[] = [];
    for (const r of rows.data ?? []) {
      const slot = one(r.interview_slots);
      const app = one(r.applications);
      if (!slot?.starts_at || !app) continue;
      bookings.push({ slotId: r.slot_id, startsAt: slot.starts_at, code: app.applicant_code ?? '—', initials: dottedInitials(app.full_name) });
    }
    // The role decides whether "Re-run pairing" shows. Admin-only in the draft schema; the shell already knows the role,
    // but this loader reads it from the session so it does not depend on the shell.
    const auth = await client.auth.getUser();
    const isAdmin = auth.data.user?.app_metadata?.role === 'admin';
    return build(bookings, new Date(), cycle.data.interview_end, me, isAdmin, 'live');
  } catch {
    return { ...build([], new Date(), null, me, false, 'live'), failed: true, source: 'live' };
  }
}
