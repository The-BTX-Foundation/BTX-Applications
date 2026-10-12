// Scholarships > Interviews: the interviews left this week and the table of interviewer pairs.
// LIVE (database from migration 20261013090000_ops_hub.sql): booked slots (`bookings` + `interview_slots`), the
// applicant's code and initials (the blind view `application_reviews`, so board accounts can read it), who interviews
// (`interview_pairings`, names from `staff_profiles` + `staff_directory()`), the video link and the cycle's interview
// end date (`cycles`). MOCK (mock/interviews.ts, mock/staff.ts): everything, when there is no Supabase env.
import { hasSupabaseEnv } from '@btx/data';
import { currentStaffId } from './me';
import { currentCycle, readAvailability, readInterviews, readStaff, sessionRole, type AvailabilityData, type Db } from './pairing-db';
import { dateOnlyLabel, dayLabel, timeLabel } from './format';
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

type Booking = { slotId: string; startsAt: string; code: string; initials: string; pair: Interviewer[]; videoUrl: string | null };

const toInterviewer = (s: StaffProfile): Interviewer => ({ userId: s.user_id, name: s.display_name, initials: s.initials });

// The mock pair and link for an applicant code.
function mockPair(code: string): { pair: Interviewer[]; videoUrl: string | null } {
  const pr = pairingFor(code);
  const a = pr ? staffById(pr.interviewer_a) : undefined;
  const b = pr ? staffById(pr.interviewer_b) : undefined;
  return { pair: a && b ? [toInterviewer(a), toInterviewer(b)] : [], videoUrl: pr?.video_url ?? null };
}

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

  const upcoming: UpcomingInterview[] = future.map((b) => {
    const pair = b.pair;
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
      videoUrl: b.videoUrl,
      when: whenLabel(b.startsAt, now),
    };
  });

  // One row per pair: interviews done, interviews left, and the next one.
  const rows = new Map<string, { names: string; done: number; left: number; next: string | null; nextAt: string; }>();
  const touch = (b: Booking, isDone: boolean) => {
    const pair = b.pair;
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
    endsLabel: 'ends Thu Dec 31',
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
      ...mockPair(a.code),
    }));
    return build(bookings, new Date(MOCK_NOW), '2026-10-09', me, true, 'mock');
  }
  try {
    const client = (await sessionClient()) as unknown as Db;
    const cycle = await currentCycle(client);
    if (!cycle) return build([], new Date(), null, me, false, 'live');
    const [{ booked, pairs }, staff, auth] = await Promise.all([readInterviews(client, cycle.id), readStaff(client), sessionRole(client)]);
    const byId = new Map(staff.map((s) => [s.userId, s]));
    const person = (id: string): Interviewer | null => {
      const s = byId.get(id);
      return s ? { userId: s.userId, name: s.name, initials: s.initials } : null;
    };
    const bookings: Booking[] = booked.map((b) => {
      const p = pairs.get(b.slotId);
      const a = p ? person(p.a) : null;
      const c = p ? person(p.b) : null;
      return { slotId: b.slotId, startsAt: b.startsAt, code: b.code, initials: b.initials, pair: a && c ? [a, c] : [], videoUrl: p?.videoUrl ?? null };
    });
    return build(bookings, new Date(), cycle.interviewEnd, me, auth.role === 'admin', 'live');
  } catch {
    return { ...build([], new Date(), null, me, false, 'live'), failed: true, source: 'live' };
  }
}

// ---- availability (D4) -------------------------------------------------------------------------------------------

export type AvailabilityView = AvailabilityData & {
  /** People who gave availability, with their names (admins read everyone's). */
  people: { userId: string; name: string }[];
  isAdmin: boolean;
  source: 'live' | 'mock';
};

// The availability data for the signed-in person: their own picks and, for admins and board members, everyone's. Live
// only; there is no grid on the page yet ("design pending"), so nothing calls this until a design exists.
export async function loadAvailability(): Promise<AvailabilityView | null> {
  if (!hasSupabaseEnv()) return null;
  try {
    const client = (await sessionClient()) as unknown as Db;
    const cycle = await currentCycle(client);
    if (!cycle) return null;
    const [data, staff, auth] = await Promise.all([readAvailability(client, cycle), readStaff(client), sessionRole(client)]);
    const names = new Map(staff.map((s) => [s.userId, s.name]));
    const ids = [...new Set(data.everyone.map((a) => a.userId))];
    return { ...data, people: ids.map((id) => ({ userId: id, name: names.get(id) ?? 'Unknown' })), isAdmin: auth.role === 'admin', source: 'live' };
  } catch {
    return null;
  }
}

// ---- video links (D7) --------------------------------------------------------------------------------------------

export type VideoLinkRow = { slotId: string; when: string; code: string; initials: string; names: string; url: string };
export type VideoLinksData = {
  rows: VideoLinkRow[];
  /** Booked interviews ahead that have no pair yet, so no link can be added. */
  unpaired: number;
  failed: boolean;
  source: 'live' | 'mock';
};

// The interviews ahead that can take a link ("Add the video links" on Today). Admins only; others get no rows.
export async function loadVideoLinks(): Promise<VideoLinksData> {
  const rowFor = (slotId: string, startsAt: string, code: string, initials: string, names: string, url: string | null): VideoLinkRow => ({
    slotId,
    when: `${dayLabel(startsAt)}, ${timeLabel(startsAt)}`,
    code,
    initials,
    names,
    url: url ?? '',
  });
  if (!hasSupabaseEnv()) {
    const rows: VideoLinkRow[] = [];
    let unpaired = 0;
    for (const a of MOCK_APPLICANTS.filter((x) => x.interviewAt && new Date(x.interviewAt) > new Date(MOCK_NOW))) {
      const m = mockPair(a.code);
      if (m.pair.length !== 2) unpaired += 1;
      else rows.push(rowFor(`mock-slot-${a.code}`, a.interviewAt as string, a.code, a.initials, `${m.pair[0].name} and ${m.pair[1].name}`, null));
    }
    return { rows, unpaired, failed: false, source: 'mock' };
  }
  try {
    const client = (await sessionClient()) as unknown as Db;
    const auth = await sessionRole(client);
    const cycle = await currentCycle(client);
    if (auth.role !== 'admin' || !cycle) return { rows: [], unpaired: 0, failed: false, source: 'live' };
    const [{ booked, pairs }, staff] = await Promise.all([readInterviews(client, cycle.id), readStaff(client)]);
    const name = new Map(staff.map((s) => [s.userId, s.name]));
    const now = Date.now();
    const rows: VideoLinkRow[] = [];
    let unpaired = 0;
    for (const b of booked.filter((x) => Date.parse(x.startsAt) > now)) {
      const p = pairs.get(b.slotId);
      if (!p) unpaired += 1;
      else rows.push(rowFor(b.slotId, b.startsAt, b.code, b.initials, `${name.get(p.a) ?? 'Unknown'} and ${name.get(p.b) ?? 'Unknown'}`, p.videoUrl));
    }
    return { rows, unpaired, failed: false, source: 'live' };
  } catch {
    return { rows: [], unpaired: 0, failed: true, source: 'live' };
  }
}
