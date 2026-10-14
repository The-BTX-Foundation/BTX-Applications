// Today's data for the signed-in person (Figma "Today" 34:2 laptop, 21:435 phone). MOCK (mock/today.ts) when there is
// no Supabase env, including ?demo=stress. LIVE: the person's tasks and the team's (lib/tasks readTasksRaw +
// buildTasks), their upcoming interviews (interview_pairings + bookings + interview_slots, codes from
// application_reviews) and events (calendar_events they own), and the Overview cards counted from cycles,
// application_reviews / application_score_summary, funds_snapshots, gifts, goals, plan_milestones, programs,
// calendar_events and posts (lib/today-build.ts, tested). ?demo=error, or any failed read, returns null: the page then
// draws the "didn't load" card.
import { hasSupabaseEnv } from '@btx/data';
import { TODAY, TODAY_STRESS, type TodayData } from '@/mock/today';
import { buildTasks } from './tasks-shared';
import { readTasksRaw } from './tasks';
import { looseClient, rows, whoAmI } from './team-db';
import { easternToday } from './team-dates';
import { headline, longDate, overview, taskGroups, type TodayFacts } from './today-build';

const num = (v: unknown) => Number(v ?? 0);

export async function loadToday(opts: { demo?: string } = {}): Promise<TodayData | null> {
  if (opts.demo === 'error') return null;
  if (!hasSupabaseEnv()) return opts.demo === 'stress' ? TODAY_STRESS : TODAY;
  try {
    const client = await looseClient();
    const { id: me, role } = await whoAmI(client);
    if (!me) return null;
    const today = easternToday();
    const year = Number(today.slice(0, 4));
    const monthStart = `${today.slice(0, 7)}-01`;
    const monthEnd = new Date(Date.UTC(year, Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();
    const [raw, cycles, apps, summary, funds, gifts, goals, milestones, programs, events, posts, pairings] = await Promise.all([
      readTasksRaw(client),
      rows(client, 'cycles', 'id, status, interview_end, decision_date, opens_at', { order: ['opens_at', false] }),
      rows(client, 'application_reviews', 'id, cycle_id, applicant_code'),
      rows(client, 'application_score_summary', 'application_id, published_count'),
      rows(client, 'funds_snapshots', 'amount_cents, as_of, created_at', { order: ['as_of', false] }),
      rows(client, 'gifts', 'amount_cents', { gte: { gift_on: `${year}-01-01` }, lte: { gift_on: `${year}-12-31` } }),
      rows(client, 'goals', 'metric, target_cents', { eq: { year, metric: 'money_raised' } }),
      rows(client, 'plan_milestones', 'name, area, due_on, done', { eq: { plan_year: year, archived: false } }),
      rows(client, 'programs', 'name, status'),
      rows(client, 'calendar_events', 'id, title, area, program_id, starts_at, all_day, owner_id', { gte: { starts_at: `${today}T00:00:00Z` }, order: ['starts_at', true] }),
      rows(client, 'posts', 'post_on, status', { gte: { post_on: monthStart } }),
      rows(client, 'interview_pairings', 'slot_id, interviewer_a, interviewer_b, video_url'),
    ]);
    const tasks = buildTasks(raw, me, today);
    const mine = tasks.tasks.filter((t) => t.mine);

    // Overview facts.
    const areaTasks: TodayFacts['areaTasks'] = {};
    for (const t of raw.tasks) {
      const a = (areaTasks[t.area] ??= { done: 0, total: 0 });
      a.total += 1;
      if (t.status === 'done') a.done += 1;
    }
    const cycle = cycles.find((c) => c.status !== 'draft');
    const cycleApps = cycle ? apps.filter((a) => a.cycle_id === cycle.id) : [];
    const scoredIds = new Set(summary.filter((s) => num(s.published_count) >= 2).map((s) => String(s.application_id)));
    const latestFunds = [...funds].sort((a, b) => String(b.as_of).localeCompare(String(a.as_of)) || String(b.created_at).localeCompare(String(a.created_at)))[0];
    const progMs = milestones.filter((m) => m.area === 'programs');
    const program = programs.find((p) => p.status === 'setting_up') ?? programs.find((p) => p.status === 'active') ?? null;
    const progEvent = events.find((e) => e.area === 'programs' || e.program_id);
    const progNextMs = progMs.filter((m) => !m.done && m.due_on && String(m.due_on) >= today).sort((a, b) => String(a.due_on).localeCompare(String(b.due_on)))[0];
    const monthPosts = posts.filter((p) => p.post_on && String(p.post_on) <= monthEnd);
    const nextPost = posts
      .filter((p) => p.post_on && String(p.post_on) >= today && p.status !== 'posted')
      .map((p) => String(p.post_on))
      .sort()[0];
    const facts: TodayFacts = {
      areaTasks,
      scholarships: {
        scored: cycleApps.filter((a) => scoredIds.has(String(a.id))).length,
        total: cycleApps.length,
        interviewEnd: cycle?.interview_end ? String(cycle.interview_end) : null,
        decision: cycle?.decision_date ? String(cycle.decision_date) : null,
      },
      money: { onHandCents: latestFunds ? num(latestFunds.amount_cents) : null, raisedCents: gifts.reduce((n, g) => n + num(g.amount_cents), 0), goalCents: goals[0]?.target_cents ? num(goals[0].target_cents) : null },
      programs: {
        milestonesDone: progMs.filter((m) => m.done).length,
        milestonesTotal: progMs.length,
        program: program ? { name: String(program.name), status: String(program.status) } : null,
        next: progEvent ? { title: String(progEvent.title), date: String(progEvent.starts_at).slice(0, 10) } : progNextMs ? { title: String(progNextMs.name), date: String(progNextMs.due_on) } : null,
      },
      outreach: { planned: monthPosts.length, posted: monthPosts.filter((p) => p.status === 'posted').length, nextPost: nextPost ?? null },
    };

    // My upcoming interviews: the slots I am paired on that have an active booking.
    const myPairs = pairings.filter((p) => p.interviewer_a === me || p.interviewer_b === me);
    let interviews: { slot_id: string; starts_at: string; code: string; video: boolean }[] = [];
    if (myPairs.length) {
      const ids = myPairs.map((p) => String(p.slot_id));
      const [bookings, slots] = await Promise.all([
        rows(client, 'bookings', 'slot_id, application_id', { eq: { status: 'active' }, in: { slot_id: ids } }),
        rows(client, 'interview_slots', 'id, starts_at', { in: { id: ids }, gte: { starts_at: nowIso } }),
      ]);
      const code = new Map(apps.map((a) => [String(a.id), String(a.applicant_code ?? '—')]));
      interviews = bookings.flatMap((b) => {
        const slot = slots.find((s) => s.id === b.slot_id);
        if (!slot) return [];
        const pair = myPairs.find((p) => p.slot_id === b.slot_id);
        return [{ slot_id: String(b.slot_id), starts_at: String(slot.starts_at), code: code.get(String(b.application_id)) ?? '—', video: Boolean(pair?.video_url) }];
      });
    }
    const myEvents = events
      .filter((e) => e.owner_id === me)
      .map((e) => ({ id: String(e.id), title: String(e.title), starts_at: String(e.starts_at), all_day: Boolean(e.all_day), area: e.area ? String(e.area) : null }));

    // The first word of the display name that is a name (sample rows carry a "[B]" tag first).
    const first = (raw.people.find((p) => p.user_id === me)?.display_name ?? '').split(/\s+/).find((w) => /^[A-Za-z]/.test(w)) ?? '';
    return {
      headline: headline(mine, first),
      dateLine: longDate(today),
      areas: overview(facts, mine, today, role === 'reviewer'),
      ...taskGroups(tasks.tasks, interviews, myEvents, today),
    };
  } catch {
    return null;
  }
}
