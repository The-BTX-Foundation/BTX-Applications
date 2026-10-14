// Pure part of the Today loader: the headline, the four Overview cards and the Tasks card's rows, from the signed-in
// person's tasks (lib/tasks-shared buildTasks) and a few counted facts. No server imports, so tests can use it.
import type { OpsIconName } from '@/components/icons';
import type { OverviewArea, TaskGroup, TaskRow, TodayData } from '@/mock/today';
import { dateOnlyLabel, dayLabel, timeLabel } from './format';
import { bucketFor, lateText, type Bucket, type TaskItem } from './tasks-shared';
import { dollars, easternDate } from './team-dates';

export type TodayFacts = {
  /** Done / total of each area's tasks (not archived). */
  areaTasks: Record<string, { done: number; total: number }>;
  scholarships: { scored: number; total: number; interviewEnd: string | null; decision: string | null };
  money: { onHandCents: number | null; raisedCents: number; goalCents: number | null };
  programs: { milestonesDone: number; milestonesTotal: number; program: { name: string; status: string } | null; next: { title: string; date: string } | null };
  outreach: { posted: number; planned: number; nextPost: string | null };
};

export type MyInterview = { slot_id: string; starts_at: string; code: string; video: boolean };
export type MyEvent = { id: string; title: string; starts_at: string; all_day: boolean; area: string | null };

const LABEL: Record<Bucket, string> = { late: 'Late', this_week: 'This week', next_week: 'Next week', later: 'Later' };
const ORDER: Bucket[] = ['late', 'this_week', 'next_week', 'later'];
const ICON: Record<string, OpsIconName> = { task: 'tasks', post: 'outreach', request: 'calendar', approval: 'approval', scoring: 'scoring', meeting: 'meeting' };
const AREA_NAME: Record<string, string> = { scholarships: 'Scholarships', money: 'Money', programs: 'Programs', outreach: 'Outreach' };
const STATUS: Record<string, string> = { setting_up: 'in setup', active: 'running', planned: 'planned', paused: 'paused', ended: 'ended' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "Monday, October 12" for an Eastern date.
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d)));
}

// The big line at the top: what is late or due for the signed-in person.
export function headline(mine: TaskItem[], first: string): string {
  const late = mine.filter((t) => t.late_days > 0).length;
  const name = first ? `, ${first}` : '';
  if (late) return `You have ${late} late task${late === 1 ? '' : 's'}${name}.`;
  const week = mine.filter((t) => t.bucket === 'this_week').length;
  if (week) return `${week} task${week === 1 ? '' : 's'} due this week${name}.`;
  return `Nothing due this week${name}.`;
}

const frac = (d: number, t: number) => (t > 0 ? d / t : 0);

// The four Overview cards (Scholarships only for a reviewer, who cannot open the other areas).
export function overview(f: TodayFacts, mine: TaskItem[], today: string, reviewer: boolean): OverviewArea[] {
  const forYou = (area: string) => {
    const n = mine.filter((t) => t.area === area).length;
    return n ? `${n} for you` : null;
  };
  const ring = (area: string, color: 'gold' | 'ink') => {
    const a = f.areaTasks[area] ?? { done: 0, total: 0 };
    return { frac: frac(a.done, a.total), label: `${a.done}/${a.total}`, color };
  };
  const s = f.scholarships;
  const sLine = s.interviewEnd && s.interviewEnd >= today ? `Interviews end ${dateOnlyLabel(s.interviewEnd)}` : s.decision ? `Decision ${dateOnlyLabel(s.decision)}` : 'Cycle dates not set';
  const cards: OverviewArea[] = [
    { id: 'scholarships', name: 'Scholarships', ring: ring('scholarships', 'gold'), big: `${s.scored} / ${s.total}`, label: 'scored', line: sLine, forYou: forYou('scholarships'), href: '/scholarships/cycle' },
  ];
  if (reviewer) return cards;
  const m = f.money;
  const year = today.slice(0, 4);
  cards.push({
    id: 'money',
    name: 'Money',
    ring: ring('money', 'gold'),
    big: m.onHandCents === null ? 'Not set' : dollars(m.onHandCents),
    label: 'on hand',
    line: m.goalCents ? `${dollars(m.raisedCents)} of ${dollars(m.goalCents)} raised` : `${dollars(m.raisedCents)} raised in ${year}`,
    forYou: forYou('money'),
    href: '/money/budget',
  });
  const p = f.programs;
  cards.push({
    id: 'programs',
    name: 'Programs',
    ring: { frac: frac(p.milestonesDone, p.milestonesTotal), label: `${p.milestonesDone}/${p.milestonesTotal}`, color: 'ink' },
    // "Certification program" -> "Certification", so the big line fits the card.
    big: p.program ? p.program.name.replace(/\s+program$/i, '') : 'No program',
    label: p.program ? (STATUS[p.program.status] ?? p.program.status.replace(/_/g, ' ')) : 'in setup',
    line: p.next ? `${p.next.title} ${dateOnlyLabel(p.next.date)}` : 'Nothing scheduled',
    forYou: forYou('programs'),
    href: '/programs/certifications',
  });
  const o = f.outreach;
  cards.push({
    id: 'outreach',
    name: 'Outreach',
    ring: { frac: frac(o.posted, o.planned), label: `${o.posted}/${o.planned}`, color: 'ink' },
    big: `${o.planned} post${o.planned === 1 ? '' : 's'}`,
    label: `planned in ${MONTHS[Number(today.slice(5, 7)) - 1]}`,
    line: o.nextPost ? `Next post ${dateOnlyLabel(o.nextPost)}` : 'No post planned',
    forYou: forYou('outreach'),
    href: '/outreach/plan',
  });
  return cards;
}

// One task as the Today card draws it.
export function taskRow(t: TaskItem, today: string): TaskRow {
  const late = t.late_days > 0;
  const isToday = t.due_on === today;
  const simple = t.type === 'task' || t.type === 'post';
  const row: TaskRow = {
    id: t.id,
    title: t.title,
    lead: simple ? 'circle' : 'icon',
    typeIcon: ICON[t.type] ?? 'tasks',
    typeLabel: t.type_label,
    sub: t.context ?? (t.owner_id ? t.area_name : 'Unassigned'),
    comments: t.comment_count || undefined,
    area: t.area_name,
    due: t.due_label || 'No date',
    rel: late ? { text: lateText(t.late_days), late: true } : isToday ? { text: 'Today' } : t.rel ? { text: t.rel } : undefined,
    phoneSub: t.owner_id ? (simple ? t.area_name : `${t.area_name} · ${t.type_label.toLowerCase()}`) : 'Unassigned',
    phoneDue: late ? lateText(t.late_days) : isToday ? 'Today' : (t.rel ?? (t.bucket === 'this_week' ? t.weekday : t.short_date || 'No date')),
    phoneLate: late || undefined,
  };
  if (late) {
    row.action = { label: 'Mark done', kind: 'p' };
    row.phoneActions = [
      { label: 'Mark done', kind: 'p' },
      { label: 'Open', kind: 's' },
    ];
    row.href = '/tasks';
  } else if (t.type === 'approval') {
    row.approval = true;
    row.action = { label: t.approval?.approveLabel ?? 'Approve', kind: 's' };
    row.href = t.approval?.planId ? '/money/budget/approval' : '/tasks?tab=approvals';
  } else if (t.type === 'request' && /availab/i.test(t.title)) {
    row.action = { label: 'Add times', kind: 's' };
    row.href = '/scholarships/interviews';
  } else if (t.type === 'scoring') {
    row.action = { label: 'Score', kind: 's' };
    row.href = '/scholarships/scoring';
  }
  return row;
}

type Entry = { date: string; at: string; row: TaskRow };

const relFor = (date: string, today: string, tomorrow: string) => (date === today ? { text: 'Today' } : date === tomorrow ? { text: 'Tomorrow' } : undefined);

// Groups rows by when they are due (Late, This week, Next week, Later), keeping the given order inside a group.
function group(entries: Entry[], today: string): TaskGroup[] {
  const sorted = [...entries].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.at.localeCompare(b.at));
  return ORDER.map((b) => ({ label: LABEL[b], rows: sorted.filter((e) => bucketFor(today, e.date || null) === b).map((e) => e.row) })).filter((g) => g.rows.length > 0);
}

// The Tasks card: Mine (my open tasks plus my interviews and events up to the end of next week), Team (every open task)
// and the counts.
export function taskGroups(all: TaskItem[], interviews: MyInterview[], events: MyEvent[], today: string): Pick<TodayData, 'groups' | 'teamGroups' | 'counts'> {
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const asEntry = (t: TaskItem): Entry => ({ date: t.due_on ?? '', at: '', row: taskRow(t, today) });
  const mine = all.filter((t) => t.mine);
  const extra: Entry[] = [];
  for (const i of interviews) {
    const date = easternDate(i.starts_at);
    const b = bucketFor(today, date);
    if (b === 'late' || b === 'later') continue;
    const time = timeLabel(i.starts_at);
    extra.push({
      date,
      at: i.starts_at,
      row: { id: `iv-${i.slot_id}`, title: `Interview ${i.code}`, lead: 'icon', typeIcon: 'meeting', typeLabel: 'Interview', sub: i.video ? `${time} · Video` : time, area: 'Scholarships', due: dayLabel(i.starts_at), rel: relFor(date, today, tomorrow), phoneSub: `Scholarships · ${time}`, phoneDue: date === today ? 'Today' : date === tomorrow ? 'Tomorrow' : dayLabel(i.starts_at).split(' ')[0], href: '/scholarships/interviews' },
    });
  }
  for (const e of events) {
    const date = easternDate(e.starts_at);
    const b = bucketFor(today, date);
    if (b === 'late' || b === 'later') continue;
    const time = e.all_day ? 'All day' : timeLabel(e.starts_at);
    const area = AREA_NAME[e.area ?? ''] ?? 'Calendar';
    extra.push({
      date,
      at: e.starts_at,
      row: { id: `ev-${e.id}`, title: e.title, lead: 'icon', typeIcon: 'calendar', typeLabel: 'Event', sub: time, area, due: dateOnlyLabel(date), rel: relFor(date, today, tomorrow), phoneSub: `${area} · ${time}`, phoneDue: date === today ? 'Today' : date === tomorrow ? 'Tomorrow' : dateOnlyLabel(date).split(' ')[0], href: '/calendar' },
    });
  }
  return {
    groups: group([...mine.map(asEntry), ...extra], today),
    teamGroups: group(all.map(asEntry), today),
    counts: { mine: mine.length, team: all.length, approvals: all.filter((t) => t.type === 'approval').length },
  };
}
