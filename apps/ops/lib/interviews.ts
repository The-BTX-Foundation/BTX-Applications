// Scholarships > Interviews: interview times (proposed from the board's availability), fairness (interviews per board
// member), the booked interviews ahead and the table of interviewer pairs.
// LIVE (database from migrations 20261013090000_ops_hub.sql and 20261013090300_interview_flow.sql): the cycle's times and
// who is free (`interview_slots`, `board_free_ranges`, `board_interview_prefs`; lib/interview-flow-db.ts), booked slots
// (`bookings`), the applicant's code and name (`applications`: every staff member sees names, D2), who interviews
// (`interview_pairings`, names from `staff_profiles` + `staff_directory()`) and the video link.
// MOCK (mock/interview-flow.ts, mock/staff.ts): everything, when there is no Supabase env.
import { hasSupabaseEnv } from '@btx/data';
import { currentStaffId } from './me';
import { currentCycle, readCandidates, readInterviews, readStaff, sessionRole, type AvailabilityData, type Db, readAvailability } from './pairing-db';
import { readBoardAvailability, readFairness, readProposedTimes } from './interview-flow-db';
import { planRebalance, type RebalanceInterview } from './rebalance';
import { lastSent } from './email/send';
import { dateOnlyLabel, dayLabel, shortDate, timeLabel } from './format';
import { easternYmd, groupByDay, type FairPerson, type MoveView, type TimeChip, type TimeDay, whenLine } from './interview-times';
import { sessionClient } from './supabase-server';
import { MOCK_APPLICANTS, MOCK_NOW } from '@/mock/applicants';
import { FLOW_BOOKED, FLOW_CYCLE, FLOW_FAIR, FLOW_NOW, FLOW_PEOPLE, MOCK_BOOKED_TIMES, mockChips } from '@/mock/interview-flow';
import { pairingFor } from '@/mock/interviews';
import { staffById, type StaffProfile } from '@/mock/staff';

export type Interviewer = { userId: string; name: string; initials: string };

export type UpcomingInterview = {
  slotId: string;
  /** "Mon", "5", "10:00 AM". */
  weekday: string;
  dayNum: string;
  time: string;
  /** "Thu Nov 12, 7:00 PM". */
  whenLine: string;
  code: string;
  /** The applicant's full name, "Sade Price". */
  applicant: string;
  /** The two interviewers; empty when nobody is paired yet ("Unassigned"). */
  pair: Interviewer[];
  /** The signed-in person is one of the two. */
  mine: boolean;
  videoUrl: string | null;
  /** "Tomorrow", "In 2 days". */
  when: string;
};

export type PairRow = { key: string; names: string; done: number; left: number; next: string };

/** One board member in the "Board availability" panel. */
export type BoardPerson = { userId: string; name: string; freeHours: number; maxInterviews: number | null; sent: boolean };

/** The "Interview times" panel: proposed times by day, who is free, and where sending stands. */
export type TimesData = {
  cycleId: string;
  /** Every day of the interview dates, with its times. */
  days: TimeDay[];
  people: BoardPerson[];
  /** Applicants who submitted. */
  applicants: number;
  /** Times a student holds now. */
  booked: number;
  /** Applicants without a booking: who "Email applicants to book" is for. */
  toEmail: number;
  /** "Applications closed Fri Nov 6 with 18 applicants." */
  closedLine: string;
  /** When the times were opened to students ("Mon Nov 9, 9:02 AM"); null until they are. */
  openedLabel: string | null;
  /** How many booking emails went out in the latest send (0 when none, or when email is not set up). */
  emailedCount: number;
};

export type FairRow = FairPerson & { sent: boolean };
export type NeedsTwoRow = { slotId: string; when: string; code: string; applicant: string };

/** The "Interviews per board member" panel. */
export type FairData = {
  people: FairRow[];
  /** Interviews with both interviewers set. */
  interviews: number;
  /** Booked interviews that still need two interviewers. */
  needsTwo: NeedsTwoRow[];
};

export type InterviewsData = {
  /** The cycle's id (null in mock mode). */
  cycleId: string | null;
  /** "Fall 2026 Legacy Scholarship · interviews Nov 10 to Nov 20 · all on video". */
  sub: string;
  /** "Nov 10 to Nov 20 · all on video" (phone). */
  subPhone: string;
  /** "ends Fri Oct 9" (phone). */
  endsLabel: string;
  done: number;
  total: number;
  /** Booked interviews ahead. */
  upcoming: UpcomingInterview[];
  /** "14 of 18 booked". */
  bookedCount: number;
  applicantCount: number;
  pairs: PairRow[];
  times: TimesData | null;
  fair: FairData | null;
  /** Board members with admin rights change times, rebalance and re-run pairing. */
  isAdmin: boolean;
  failed: boolean;
  source: 'live' | 'mock';
};

type Booking = { slotId: string; startsAt: string; code: string; applicant: string; pair: Interviewer[]; videoUrl: string | null };

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

// Builds the page data from booked interviews (shared by mock and live mode). The times and fairness panels are added by the caller.
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
      whenLine: whenLine(b.startsAt),
      code: b.code,
      applicant: b.applicant,
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
    cycleId: null,
    sub: end ? `Interviews end ${end} · all on video` : 'All on video',
    subPhone: 'Scholarships · all on video',
    endsLabel: end ? `ends ${end}` : '',
    done: past.length,
    total: sorted.length,
    upcoming,
    bookedCount: sorted.length,
    applicantCount: sorted.length,
    pairs,
    times: null,
    fair: null,
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
  const row = (r: Omit<UpcomingInterview, 'slotId' | 'videoUrl' | 'whenLine'>, i: number): UpcomingInterview => ({ ...r, whenLine: `${r.weekday} ${r.dayNum}, ${r.time}`, slotId: `stress-${i}`, videoUrl: r.pair.length ? 'https://meet.example.org/btx/stress' : null });
  return {
    cycleId: null,
    sub: 'Interviews end Fri Oct 9 · all on video',
    subPhone: 'Scholarships · all on video',
    endsLabel: 'ends Thu Dec 31',
    done: 116,
    total: 120,
    upcoming: [
      row({ weekday: 'Mon', dayNum: '5', time: '8:00 AM', code: 'APP-2026-00120', applicant: 'Adaeze-Grace Okonkwo-Fitzgerald', pair: [kd, tf], mine: false, when: 'Tomorrow' }, 1),
      row({ weekday: 'Tue', dayNum: '6', time: '9:30 PM', code: 'APP-2026-00119', applicant: 'Jean-Marc Abernathy-Oyelaran', pair: [ck, ds], mine: false, when: 'In 2 days' }, 2),
      row({ weekday: 'Wed', dayNum: '7', time: '12:00 PM', code: 'APP-2026-00017', applicant: 'Folake Nwosu', pair: [dm, cg], mine: true, when: 'In 3 days' }, 3),
      row({ weekday: 'Thu', dayNum: '8', time: '7:00 PM', code: 'APP-2026-00118', applicant: 'Brianna Reid', pair: [], mine: false, when: 'In 4 days' }, 4),
    ],
    bookedCount: 120,
    applicantCount: 120,
    pairs: [
      { key: 'a', names: 'Dania Morris + Chariah Ghee', done: 106, left: 1, next: 'Wed Sep 30' },
      { key: 'b', names: 'Kelsey Davis + Tomi Falodun', done: 3, left: 1, next: 'Mon Oct 5' },
      { key: 'c', names: 'Cillisha Knights + Darien Strachan', done: 2, left: 1, next: 'Tue Oct 6' },
      { key: 'd', names: 'Marcus Davis + Kelsey Davis', done: 2, left: 1, next: 'Thu Dec 31' },
      { key: 'e', names: 'Tomi Falodun + Darien Strachan', done: 2, left: 0, next: 'Done' },
      { key: 'f', names: 'Dania Morris + Marcus Davis', done: 1, left: 0, next: 'Done' },
    ],
    times: null,
    fair: null,
    isAdmin: true,
    failed: false,
    source: 'mock',
  };
}

// The mock story of the interview flow. ?demo= picks the stage: "waiting" (nobody has built times), "proposed" (the
// default), "sent" (times opened, two booked), "fair" (14 of 18 booked, an uneven split) or "board" (proposed, read-only).
function mockFlow(demo: string | undefined, me: string | null): InterviewsData {
  const now = new Date(FLOW_NOW);
  const fairStage = demo === 'fair';
  const bookings: Booking[] = fairStage
    ? FLOW_BOOKED.map((b) => ({ slotId: b.slotId, startsAt: b.startsAt, code: b.code, applicant: b.applicant, videoUrl: null, pair: b.pair.map((id) => toInterviewer(staffById(id)!)) }))
    : [];
  const base = build(bookings, now, FLOW_CYCLE.interviewEnd, me, demo !== 'board', 'mock');
  const waiting = demo === 'waiting';
  const sent = demo === 'sent';
  const chips: TimeChip[] = waiting ? [] : mockChips(sent, sent ? MOCK_BOOKED_TIMES : {});
  const people: BoardPerson[] = FLOW_PEOPLE.map((p) => ({ ...p, sent: waiting ? !['mock-staff-md', 'mock-staff-ds'].includes(p.userId) : true }));
  const booked = chips.filter((c) => c.booked).length;
  const times: TimesData | null = fairStage
    ? null
    : {
        cycleId: FLOW_CYCLE.id,
        days: groupByDay(FLOW_CYCLE.interviewStart, FLOW_CYCLE.interviewEnd, chips),
        people,
        applicants: FLOW_CYCLE.applicants,
        booked,
        toEmail: FLOW_CYCLE.applicants - booked,
        closedLine: `Applications closed ${FLOW_CYCLE.closesLine} with ${FLOW_CYCLE.applicants} applicants.`,
        openedLabel: sent ? 'Mon Nov 9, 9:02 AM' : null,
        emailedCount: sent ? FLOW_CYCLE.applicants : 0,
      };
  const fair: FairData | null = fairStage
    ? {
        people: FLOW_FAIR.map((p) => ({ userId: p.userId, name: p.name, interviews: p.interviews, target: p.target, maxInterviews: p.maxInterviews, overBy: p.interviews - p.target, sent: true })),
        interviews: 18,
        needsTwo: [],
      }
    : null;
  return {
    ...base,
    sub: `${FLOW_CYCLE.term} ${FLOW_CYCLE.award} · interviews ${shortDate(FLOW_CYCLE.interviewStart)} to ${shortDate(FLOW_CYCLE.interviewEnd)} · all on video`,
    subPhone: `${shortDate(FLOW_CYCLE.interviewStart)} to ${shortDate(FLOW_CYCLE.interviewEnd)} · all on video`,
    bookedCount: fairStage ? 14 : booked,
    applicantCount: FLOW_CYCLE.applicants,
    times,
    fair,
  };
}

// Loads the interviews page. A failed query returns failed: true instead of throwing.
export async function loadInterviews(opts: { forceError?: boolean; stress?: boolean; demo?: string } = {}): Promise<InterviewsData> {
  const me = await currentStaffId();
  if (!hasSupabaseEnv()) {
    if (opts.forceError) return { ...build([], new Date(FLOW_NOW), null, me, true, 'mock'), failed: true };
    if (opts.stress) return stress();
    return mockFlow(opts.demo, me);
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
      return { slotId: b.slotId, startsAt: b.startsAt, code: b.code, applicant: b.applicant, pair: a && c ? [a, c] : [], videoUrl: p?.videoUrl ?? null };
    });
    const base = build(bookings, new Date(), cycle.interviewEnd, me, auth.role === 'admin', 'live');

    // The cycle's name and dates, and how many applicants submitted.
    const [head, apps, tp, ba, fr] = await Promise.all([
      client.from('cycles').select('term, award_name, closes_at').eq('id', cycle.id).maybeSingle(),
      client.from('applications').select('id', { count: 'exact', head: true }).eq('cycle_id', cycle.id).eq('status', 'submitted'),
      readProposedTimes(client, cycle.id),
      readBoardAvailability(client, cycle.id),
      readFairness(client, cycle.id),
    ]);
    if (head.error || apps.error || !tp.ok || !ba.ok || !fr.ok) throw new Error('read failed');
    const applicants = apps.count ?? 0;
    const name = [head.data?.term, head.data?.award_name].filter(Boolean).join(' ');
    const dates = cycle.interviewStart && cycle.interviewEnd ? `${shortDate(cycle.interviewStart)} to ${shortDate(cycle.interviewEnd)}` : '';
    const heldBy = new Map(booked.map((b) => [b.slotId, b.applicant]));
    const chips: TimeChip[] = tp.times.map((t) => ({
      slotId: t.slotId,
      startsAt: t.startsAt,
      time: timeLabel(t.startsAt),
      freeCount: t.freeCount,
      opened: t.openedAt !== null,
      booked: t.booked,
      bookedBy: t.booked ? (heldBy.get(t.slotId) ?? null) : null,
    }));
    const firstOpen = tp.times.map((t) => t.openedAt).filter((x): x is string => x !== null).sort()[0] ?? null;
    const heldCount = chips.filter((c) => c.booked).length;
    const closes = head.data?.closes_at ? easternYmd(head.data.closes_at) : null;
    const closed = closes !== null && new Date(head.data!.closes_at as string).getTime() < Date.now();
    const closedLine = closes === null ? `${applicants} ${applicants === 1 ? 'applicant' : 'applicants'} so far.` : closed ? `Applications closed ${dateOnlyLabel(closes)} with ${applicants} ${applicants === 1 ? 'applicant' : 'applicants'}.` : `${applicants} ${applicants === 1 ? 'application' : 'applications'} so far. They close ${dateOnlyLabel(closes)}.`;
    const emailed = firstOpen && auth.role === 'admin' ? await lastSent('book', cycle.id).catch(() => ({ count: 0, at: null })) : { count: 0, at: null };
    const times: TimesData = {
      cycleId: cycle.id,
      days: groupByDay(cycle.interviewStart, cycle.interviewEnd, chips),
      people: ba.people.map((p) => ({ userId: p.userId, name: p.name, freeHours: p.freeHours, maxInterviews: p.maxInterviews, sent: p.sentAt !== null })),
      applicants,
      booked: heldCount,
      toEmail: Math.max(0, applicants - booked.length),
      closedLine,
      openedLabel: firstOpen ? `${dayLabel(firstOpen)}, ${timeLabel(firstOpen)}` : null,
      emailedCount: emailed.count,
    };
    const fair: FairData | null =
      booked.length === 0
        ? null
        : {
            people: fr.people.map((p) => ({ userId: p.userId, name: p.name, interviews: p.interviews, target: p.target, maxInterviews: p.maxInterviews, overBy: p.overBy, sent: p.sentAt !== null })),
            interviews: booked.length - fr.needsTwo.length,
            needsTwo: fr.needsTwo.map((n) => ({ slotId: n.slotId, when: whenLine(n.startsAt), code: n.code, applicant: n.applicant })),
          };
    return {
      ...base,
      cycleId: cycle.id,
      sub: `${[name, dates ? `interviews ${dates}` : '', 'all on video'].filter(Boolean).join(' · ')}`,
      subPhone: `${[dates, 'all on video'].filter(Boolean).join(' · ')}`,
      bookedCount: booked.length,
      applicantCount: applicants,
      times,
      fair,
    };
  } catch {
    return { ...build([], new Date(), null, me, false, 'live'), failed: true, source: 'live' };
  }
}

// What "Rebalance future interviews" would move, without moving anything (the confirm step lists each move). Admin only.
// Same plan as rebalanceInterviews in lib/interview-flow-db.ts: only interviews more than 48 hours away, one interviewer
// at a time, from someone over their share to someone under it who may take that interview.
export async function previewRebalance(db: Db, cycleId: string, now = new Date()): Promise<{ ok: true; moves: MoveView[] } | { ok: false; message: string }> {
  const me = await sessionRole(db);
  if (me.role !== 'admin') return { ok: false, message: 'Only board members with admin rights can rebalance interviews.' };
  try {
    const [fr, { booked, pairs }] = await Promise.all([readFairness(db, cycleId), readInterviews(db, cycleId)]);
    if (!fr.ok) return fr;
    const cutoff = now.getTime() + 48 * 3_600_000;
    const interviews: RebalanceInterview[] = [];
    for (const b of booked) {
      const p = pairs.get(b.slotId);
      if (!p) continue;
      const candidates = Date.parse(b.startsAt) > cutoff ? (await readCandidates(db, b.slotId, b.applicationId)).map((c) => c.userId) : [];
      interviews.push({ slotId: b.slotId, startsAt: b.startsAt, endsAt: b.endsAt, a: p.a, b: p.b, candidates });
    }
    const senders = fr.people.filter((p) => p.target !== null).map((p) => ({ userId: p.userId, name: p.name, maxInterviews: p.maxInterviews }));
    const plan = planRebalance({ people: senders, interviews, now });
    const names = new Map(fr.people.map((p) => [p.userId, p.name]));
    const bySlot = new Map(booked.map((b) => [b.slotId, b]));
    const moves: MoveView[] = plan.moves.map((m) => ({
      slotId: m.slotId,
      startsAt: bySlot.get(m.slotId)?.startsAt ?? '',
      applicant: bySlot.get(m.slotId)?.applicant ?? '',
      from: m.from,
      to: m.to,
      fromName: names.get(m.from) ?? 'Unknown',
      toName: names.get(m.to) ?? 'Unknown',
    }));
    return { ok: true, moves };
  } catch {
    return { ok: false, message: "Couldn't check the rebalance. Try again." };
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

export type VideoLinkRow = { slotId: string; when: string; code: string; /** The applicant's full name. */ applicant: string; names: string; url: string };
export type VideoLinksData = {
  rows: VideoLinkRow[];
  /** Booked interviews ahead that have no pair yet, so no link can be added. */
  unpaired: number;
  failed: boolean;
  source: 'live' | 'mock';
};

// The interviews ahead that can take a link ("Add the video links" on Today). Admins only; others get no rows.
export async function loadVideoLinks(): Promise<VideoLinksData> {
  const rowFor = (slotId: string, startsAt: string, code: string, applicant: string, names: string, url: string | null): VideoLinkRow => ({
    slotId,
    when: `${dayLabel(startsAt)}, ${timeLabel(startsAt)}`,
    code,
    applicant,
    names,
    url: url ?? '',
  });
  if (!hasSupabaseEnv()) {
    const rows: VideoLinkRow[] = [];
    let unpaired = 0;
    for (const a of MOCK_APPLICANTS.filter((x) => x.interviewAt && new Date(x.interviewAt) > new Date(MOCK_NOW))) {
      const m = mockPair(a.code);
      if (m.pair.length !== 2) unpaired += 1;
      else rows.push(rowFor(`mock-slot-${a.code}`, a.interviewAt as string, a.code, a.name, `${m.pair[0].name} and ${m.pair[1].name}`, null));
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
      else rows.push(rowFor(b.slotId, b.startsAt, b.code, b.applicant, `${name.get(p.a) ?? 'Unknown'} and ${name.get(p.b) ?? 'Unknown'}`, p.videoUrl));
    }
    return { rows, unpaired, failed: false, source: 'live' };
  } catch {
    return { rows: [], unpaired: 0, failed: true, source: 'live' };
  }
}
