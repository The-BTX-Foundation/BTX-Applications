// The Today page's data. Mock mode returns the Figma sample (mock/today.ts). Live mode builds the same shape from the real
// tables as the signed-in person: their tasks and approvals, the team's, and the four Overview cards (lib/daily-tasks.ts).
import { hasSupabaseEnv } from '@btx/data';
import { readRows, whoAmI } from './daily-db';
import { loadLiveTasks, safe } from './daily-load';
import { buildToday, ringProgress, type AreaFacts } from './daily-tasks';
import { availabilityRow, insertRow } from './availability-today';
import { TODAY, TODAY_STRESS, type TodayData } from '@/mock/today';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export type TodayResult = (TodayData & { failed: false }) | { failed: true };

export async function loadToday({ demo }: { demo?: string } = {}): Promise<TodayResult> {
  if (demo === 'error') return { failed: true };
  if (!hasSupabaseEnv()) return { ...(demo === 'stress' ? TODAY_STRESS : TODAY), failed: false };
  try {
    const who = await whoAmI();
    if (!who) return { failed: true };
    const live = await loadLiveTasks(who.id);
    const today = live.today;
    const year = Number(today.slice(0, 4));
    const month = today.slice(0, 7);
    const monthEnd = new Date(Date.UTC(year, Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);

    const [cycles, reviews, summary, funds, gifts, goals, programs, calls, posts] = await Promise.all([
      safe(readRows('cycles', 'id, status, interview_start, interview_end, closes_at, created_at', { order: ['created_at', false] })),
      safe(readRows('applications', 'id, cycle_id', { eq: { status: 'submitted' } })),
      safe(readRows('application_score_summary', 'application_id, published_count')),
      safe(readRows('funds_snapshots', 'amount_cents, as_of', { order: ['as_of', false], limit: 1 })),
      safe(readRows('gifts', 'amount_cents, gift_on', { gte: { gift_on: `${year}-01-01` }, lte: { gift_on: `${year}-12-31` } })),
      safe(readRows('goals', 'metric, target_cents', { eq: { year } })),
      safe(readRows('programs', 'name, status, kind', { order: ['created_at', true] })),
      safe(readRows('calendar_events', 'starts_at, kind', { eq: { kind: 'planning_call' }, order: ['starts_at', true] })),
      safe(readRows('posts', 'post_on, status', { gte: { post_on: `${month}-01` }, lte: { post_on: monthEnd }, order: ['post_on', true] })),
    ]);

    const first = (live.people.find((p) => p.user_id === who.id)?.display_name ?? '').split(/\s+/)[0] || 'there';
    const mine = live.tasks.filter((t) => t.mine);

    // The cycle in play: a published one, else the newest.
    const cycle = cycles.find((c) => c.status === 'published') ?? cycles[0];
    const apps = cycle ? reviews.filter((r) => r.cycle_id === cycle.id) : [];
    const published = new Map(summary.map((s) => [String(s.application_id), Number(s.published_count)]));
    const scored = apps.filter((a) => (published.get(String(a.id)) ?? 0) >= 2).length;

    const mineByArea: Record<string, number> = {};
    for (const t of mine) mineByArea[t.area] = (mineByArea[t.area] ?? 0) + 1;

    const raise = goals.find((g) => g.metric === 'money_raised');
    const planning = calls.find((c) => String(c.starts_at) >= `${today}T00:00:00`) ?? null;
    const program = programs.find((p) => p.status === 'setting_up') ?? programs.find((p) => p.status !== 'ended') ?? programs[0];
    const nextPost = posts.find((p) => p.status !== 'posted' && String(p.post_on) >= today);

    const facts: AreaFacts = {
      mineByArea,
      ring: ringProgress(live.raw.tasks, live.raw.checklists, cycle ? String(cycle.id) : null),
      cycle: cycle ? { interviewEnd: (cycle.interview_end as string | null) ?? null, scored, applications: apps.length } : null,
      fundsCents: funds[0] ? Number(funds[0].amount_cents) : null,
      raisedCents: gifts.reduce((s, g) => s + Number(g.amount_cents), 0),
      raiseTargetCents: raise?.target_cents ? Number(raise.target_cents) : null,
      programName: program ? String(program.kind) : null,
      programStatus: program ? String(program.status) : null,
      planningCall: planning ? `Planning call ${planningLabel(String(planning.starts_at))}` : null,
      monthName: MONTHS[Number(month.slice(5, 7)) - 1],
      postsPlanned: posts.length,
      postsDone: posts.filter((p) => p.status === 'posted').length,
      nextPost: nextPost ? dayShort(String(nextPost.post_on)) : null,
    };
    const built = buildToday({ today, first, mine, team: live.tasks, facts });
    // "Give your interview availability by ...": for a board member who has not sent it yet (a failed read adds nothing).
    const sent = cycle ? await readRows('board_interview_prefs', 'availability_sent_at', { eq: { cycle_id: String(cycle.id), user_id: who.id } }).catch(() => null) : null;
    const item = cycle && sent
      ? availabilityRow({
          cycle: { id: String(cycle.id), closesAt: (cycle.closes_at as string | null) ?? null, interviewStart: (cycle.interview_start as string | null) ?? null, interviewEnd: (cycle.interview_end as string | null) ?? null },
          sentAt: sent[0] ? ((sent[0].availability_sent_at as string | null) ?? null) : null,
          today,
        })
      : null;
    if (!item) return { ...built, failed: false };
    return { ...built, counts: { ...built.counts, mine: built.counts.mine + 1 }, groups: insertRow(built.groups, item, today), failed: false };
  } catch {
    return { failed: true };
  }
}

// "Thu Oct 22" for a moment (Eastern).
function planningLabel(ts: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(ts)).replace(',', '');
}
function dayShort(d: string): string {
  const [y, m, dd] = d.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(Date.UTC(y, m - 1, dd))).replace(',', '');
}
