// Live mode: builds the Today view (lib/today-view.ts) from the real tables as the signed-in person. Every read goes through the
// session client, so row-level security applies exactly as for the other pages. The mapping itself is pure (lib/today-map.ts).
// A failed tasks read sets `tasksFailed` and the rest still draws; each other part falls back to empty rather than guessing.
import { readRows, whoAmI, type Row } from './daily-db';
import { loadLiveTasks, safe } from './daily-load';
import { easternDay } from './daily-tasks';
import { dateOnlyLabel } from './format';
import { dateLabel, joinBooked, mapAreas, mapAvailabilityRequest, mapCaps, mapChat, mapNeeds, mapScheduleLines, mapTasks, mapTickets, nameMap, nextPlanningCall, easternStartOfDay, type AreaInput, type PrepCandidate, type Raw } from './today-map';
import type { ChatPreview, TodayResultV2 } from './today-view';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const EMPTY_CHAT: ChatPreview = { channelId: null, unread: 0, latest: null };

/** Reads the real tables and returns the Today view, or `{ failed: true }` when the person cannot be identified or the read throws. */
export async function loadLiveTodayView(): Promise<TodayResultV2> {
  try {
    const who = await whoAmI();
    if (!who) return { failed: true };
    const now = new Date();
    const today = easternDay(now);
    const year = Number(today.slice(0, 4));
    const month = today.slice(0, 7);
    const monthEnd = new Date(Date.UTC(year, Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);

    // Tasks: the one read whose failure the page shows ("Your tasks didn't load"); everything else degrades to empty.
    const tasksRead = await loadLiveTasks(who.id, now).catch(() => null);

    // Reads return at most 1,000 rows (the API cap), so they are narrowed. The cycle in play (published, else newest; the newest 10
    // cycles are plenty) scopes the booking card and the Areas row; tickets and the schedule look at every interview still ahead.
    const cycles = await safe(readRows('cycles', 'id, status, interview_start, interview_end, closes_at, created_at', { order: ['created_at', false], limit: 10 }));
    const published = cycles.find((c) => c.status === 'published') ?? null;
    const cycle = published ?? cycles[0] ?? null;
    const cycleEq = cycle ? { cycle_id: String(cycle.id) } : null;

    // Stage 1: things that need nothing else.
    const [people, submitted, summary, cycleSlots, aheadSlots, bookings, myAssigned, funds, gifts, goals, programs, calls, posts, unread, areaChannels] = await Promise.all([
      safe(readRows('staff_profiles', 'user_id, display_name, initials')),
      // Submitted applications of the cycle in play with names: board and admin read them in full (D2). One cycle = well under the cap.
      cycleEq ? safe(readRows('applications', 'id, cycle_id, applicant_code, full_name', { eq: { status: 'submitted', ...cycleEq } })) : Promise.resolve([]),
      safe(readRows('application_score_summary', 'application_id, published_count')),
      // The cycle in play's slots, for "has booking opened" on the booking card.
      cycleEq ? safe(readRows('interview_slots', 'id, cycle_id, starts_at, ends_at, opened_at', { eq: cycleEq })) : Promise.resolve([]),
      // Every slot, in any cycle, that has not ended yet: tickets and the schedule come from these (F7).
      safe(readRows('interview_slots', 'id, cycle_id, starts_at, ends_at, opened_at', { gte: { ends_at: now.toISOString() } })),
      // Active bookings (one per applicant; capped at 1,000 rows), joined by id to the slots above.
      safe(readRows('bookings', 'application_id, slot_id, status', { eq: { status: 'active' } })),
      // Which tasks are the viewer's, for the prep match (done prep tasks are not in the open list).
      safe(readRows('task_assignees', 'task_id', { eq: { user_id: who.id } })),
      safe(readRows('funds_snapshots', 'amount_cents, as_of', { order: ['as_of', false], limit: 1 })),
      safe(readRows('gifts', 'amount_cents, gift_on', { gte: { gift_on: `${year}-01-01` }, lte: { gift_on: `${year}-12-31` } })),
      safe(readRows('goals', 'metric, target_cents', { eq: { year } })),
      safe(readRows('programs', 'name, status, kind', { order: ['created_at', true] })),
      // Only the next planning call: from the start of today in Eastern time, soonest first, one row.
      safe(readRows('calendar_events', 'starts_at, kind', { eq: { kind: 'planning_call' }, gte: { starts_at: easternStartOfDay(today) }, order: ['starts_at', true], limit: 1 })),
      safe(readRows('posts', 'post_on, status', { gte: { post_on: `${month}-01` }, lte: { post_on: monthEnd }, order: ['post_on', true] })),
      safe(readRows('chat_unread_counts', 'unread')),
      // The area channels (kind = 'area'). A failed read is null: no chat card at all rather than guessing which channel is public.
      readRows('chat_channels', 'id, kind', { eq: { kind: 'area' } }).catch(() => null),
    ]);

    // Stage 2: what the first stage's ids point at, read by id in chunks (a long id list would overflow the request URL).
    const aheadIds = new Set(aheadSlots.map((s) => String(s.id)));
    const aheadBookings = bookings.filter((b) => aheadIds.has(String(b.slot_id)));
    const areaIds = (areaChannels ?? []).map((c) => String(c.id));
    const [pairings, bookedApps, messages] = await Promise.all([
      safe(readIn('interview_pairings', 'slot_id, interviewer_a, interviewer_b', 'slot_id', [...aheadIds])),
      safe(readIn('applications', 'id, cycle_id, applicant_code, full_name', 'id', [...new Set(aheadBookings.map((b) => String(b.application_id)))])),
      // The 20 newest messages in AREA channels only, so direct messages can never crowd them out (F6).
      areaIds.length > 0 ? safe(readRows('chat_messages', 'id, channel_id, author_id, is_bot, body, created_at', { in: { channel_id: areaIds }, order: ['created_at', false], limit: 20 })) : Promise.resolve([]),
    ]);

    const staff = people.map((p) => ({ user_id: String(p.user_id), display_name: String(p.display_name), initials: String(p.initials) }));
    const names = nameMap(staff);

    // Booked interviews: bookings joined by hand to their slot, applicant and pairing (RLS shows staff all of them).
    const booked = joinBooked(aheadBookings, aheadSlots, bookedApps, pairings);

    // Prep tasks: the viewer's tasks (open or done) whose title says "prep ... interview".
    const mineIds = new Set(myAssigned.map((a) => String(a.task_id)));
    const rawTasks: Raw[] = tasksRead?.raw.tasks ?? [];
    const prepTasks: PrepCandidate[] = rawTasks
      .filter((t) => mineIds.has(String(t.id)) && (t.status === 'open' || t.status === 'in_progress' || t.status === 'done'))
      .map((t) => ({ id: String(t.id), title: String(t.title), status: String(t.status), due_on: (t.due_on as string | null) ?? null }));

    // "Give your interview availability": a failed read (null) adds nothing, as in the old loader.
    const sent = cycle ? await readRows('board_interview_prefs', 'availability_sent_at', { eq: { cycle_id: String(cycle.id), user_id: who.id } }).catch(() => null) : null;
    const request = cycle && sent
      ? mapAvailabilityRequest({
          cycle: { id: String(cycle.id), closesAt: (cycle.closes_at as string | null) ?? null, interviewStart: (cycle.interview_start as string | null) ?? null, interviewEnd: (cycle.interview_end as string | null) ?? null },
          sentAt: sent[0] ? ((sent[0].availability_sent_at as string | null) ?? null) : null,
          today,
        })
      : null;

    const tasks = tasksRead ? [...(request ? [request] : []), ...mapTasks(tasksRead.tasks, mapScheduleLines(booked, who.id, names, now))] : [];

    // Areas: the same facts the old Today read, as bars / squares / text.
    const apps = cycle ? submitted.filter((a) => String(a.cycle_id) === String(cycle.id)) : [];
    const publishedScores = new Map(summary.map((s) => [String(s.application_id), Number(s.published_count)]));
    const scored = apps.filter((a) => (publishedScores.get(String(a.id)) ?? 0) >= 2).length;
    const raise = goals.find((g) => g.metric === 'money_raised');
    const planning = nextPlanningCall(calls, today);
    const program = programs.find((p) => p.status === 'setting_up') ?? programs.find((p) => p.status !== 'ended') ?? programs[0];
    const nextPost = posts.find((p) => p.status !== 'posted' && String(p.post_on) >= today);
    const facts: AreaInput = {
      cycle: cycle ? { interviewEnd: (cycle.interview_end as string | null) ?? null, scored, applications: apps.length } : null,
      fundsCents: funds[0] ? Number(funds[0].amount_cents) : null,
      raisedCents: gifts.reduce((s, g) => s + Number(g.amount_cents), 0),
      raiseTargetCents: raise?.target_cents ? Number(raise.target_cents) : null,
      programName: program ? String(program.kind) : null,
      programStatus: program ? String(program.status) : null,
      planningCall: planning ? planningLabel(String(planning.starts_at)) : null,
      monthName: MONTHS[Number(month.slice(5, 7)) - 1],
      postsPlanned: posts.length,
      postsDone: posts.filter((p) => p.status === 'posted').length,
      nextPost: nextPost ? dateOnlyLabel(String(nextPost.post_on)) : null,
    };

    // No area-channel list (read failed) = no chat card: no channel, no message, no reply box.
    const chat = areaChannels === null ? EMPTY_CHAT : mapChat({ messages, unread, people: staff, me: who.id, areaChannelIds: areaChannels.map((c) => String(c.id)) });

    return {
      today,
      dateLabel: dateLabel(today),
      needs: mapNeeds({ cycle: published ? { id: String(published.id), interview_end: published.interview_end } : null, submitted, activeBookings: bookings, slots: cycleSlots }),
      tasks,
      teamOpen: tasksRead ? tasksRead.tasks.length : 0,
      tasksFailed: tasksRead === null,
      interviews: mapTickets(booked, who.id, names, now, prepTasks),
      areas: mapAreas(facts),
      chat,
      caps: mapCaps(chat),
      failed: false,
    };
  } catch {
    return { failed: true };
  }
}

/** "Thu Oct 22" for a timestamp (Eastern). */
function planningLabel(ts: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(ts)).replace(',', '');
}

/** Reads rows whose `column` is one of `ids`, 50 ids per request so the URL stays short. No ids = no read. */
async function readIn(table: string, select: string, column: string, ids: string[]): Promise<Row[]> {
  const out: Row[] = [];
  for (let i = 0; i < ids.length; i += 50) out.push(...(await readRows(table, select, { in: { [column]: ids.slice(i, i + 50) } })));
  return out;
}
