// The Cycle page's pure logic (unit tested in tests/cycle-map.test.ts; no database, no React): whether applications are
// open (B14: worked out from the cycle's dates, the Portal's rule, never from `status`), the six schedule stages and
// their states, the dated line drawn above them, the checklist's groups, steps and progress, the words on each step's
// line, the news card, and the live tasks mapped to steps. Calendar days are "YYYY-MM-DD" strings counted with
// lib/refresh-time.ts (UTC-midnight arithmetic on the day itself, so no time zone can shift a day).
import { addDays, atDay, clock, daysFrom, easternDay, fullDate, MO, shortDate, weekday } from './refresh-time';
import type { CyCycle, CyGroupId, CyOwner, CyRow } from './cycle-view';
import { approvalHref } from './today-map';

export type Row = Record<string, unknown>;
const s = (v: unknown): string => (v == null ? '' : String(v));

/* ---------------------------------------------------------------- B14: open / closed from the dates */

/** Where applications stand, exactly as the Portal decides it (packages/data/src/cycles.ts cycleVariant). */
export type CyPhase = 'before-open' | 'open' | 'closed';

/**
 * Applications' state at the instant `now`: no opening time = closed; before opens_at = before-open; at or after
 * closes_at = closed; else open. Instants are compared as instants (closes_at carries the deadline hour).
 */
export function cyclePhase(now: string, opensAt: string | null, closesAt: string | null): CyPhase {
  if (!opensAt) return 'closed';
  const t = instantMs(now);
  if (t < instantMs(opensAt)) return 'before-open';
  if (closesAt && t >= instantMs(closesAt)) return 'closed';
  return 'open';
}

/**
 * An instant as milliseconds. Postgres can send microseconds ("…59.123456+00:00"), which some browsers (Safari) refuse;
 * the fraction is cut to 3 digits first.
 */
export function instantMs(at: string): number {
  return Date.parse(at.replace(/(\.\d{3})\d+/, '$1'));
}

/* ---------------------------------------------------------------- words */

/** The schedule's plain-word time: "Yesterday", "Today", "Tomorrow", "Thu" (within 5 days), "in 12 days" (within 20), else "Sun Nov 22". */
export function stageRel(today: string, day: string): string {
  const n = daysFrom(today, day);
  if (n < -1) return shortDate(day);
  if (n === -1) return 'Yesterday';
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n <= 5) return weekday(day);
  if (n <= 20) return `in ${n} days`;
  return shortDate(day);
}

/** "Nov 6" (month and day). */
export function monthDay(day: string): string {
  const d = atDay(day);
  return `${MO[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "$2,500" from cents ("$2,500.50" when there are cents). */
export function money(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** "N days late" for a past day (1 day late). */
export function lateWord(today: string, day: string): string {
  const n = -daysFrom(today, day);
  return `${n} day${n === 1 ? '' : 's'} late`;
}

/** When a step was done: "Today, 8:01 AM" today (Eastern), else "Fri Nov 6". */
export function doneWord(today: string, at: string): string {
  const day = easternDay(at);
  return day === today ? `Today, ${clock(at)}` : shortDate(day);
}

/** The line on a step: done words, a "N days late" tag, or the due day (with its time). */
export type CyWhen = { kind: 'done'; text: string } | { kind: 'late'; text: string; title: string } | { kind: 'due'; text: string; title: string } | { kind: 'none' };

/** The words on a step's line. `doneText` replaces the stored done time after a local tick ("today, 9:15 AM"). */
export function rowWhen(today: string, r: CyRow, doneText?: string | null): CyWhen {
  if (r.done) return { kind: 'done', text: `Done${doneText ? ` ${doneText}` : r.doneAt ? ` ${doneWord(today, r.doneAt)}` : ''}` };
  if (!r.due) return { kind: 'none' };
  if (daysFrom(today, r.due) < 0) return { kind: 'late', text: lateWord(today, r.due), title: `Was due ${fullDate(r.due)}` };
  return { kind: 'due', text: `${shortDate(r.due)}${r.time ? `, ${r.time}` : ''}`, title: `${fullDate(r.due)}${r.time ? `, ${r.time}` : ''}` };
}

/** The first name of a step owned by another person whose step is late ("Waiting on Charlie"), else null. */
export function waitingOn(today: string, r: CyRow): string | null {
  if (r.done || !r.due || !r.owner || r.owner.kind !== 'person') return null;
  if (daysFrom(today, r.due) >= 0) return null;
  return r.owner.label.split(/\s+/)[0] || null;
}

/** The page title and the line beside it ("Legacy Scholarship · $2,500"). */
export function subParts(c: CyCycle): string[] {
  return [c.award, c.amountCents != null && c.amountCents > 0 ? money(c.amountCents) : null].filter((x): x is string => !!x);
}

/* ---------------------------------------------------------------- the schedule */

export type CyStageState = 'done' | 'now' | 'up' | 'unset';

/** One schedule stage as the page draws it. `dates` are the parts kept on one line each, joined by `sep`. */
export type CyStage = {
  key: 'applications' | 'interviews' | 'scores' | 'selection' | 'award' | 'funds';
  group: CyGroupId;
  name: string;
  state: CyStageState;
  dates: string[] | null;
  sep: string;
  title: string | null;
  note: { kind: 'closed' } | { kind: 'text'; text: string; ink: boolean } | { kind: 'unset' } | null;
  drawn: { kind: 'applied'; n: number | null } | { kind: 'bar'; what: 'booked' | 'scored'; k: number | null; n: number | null; ink: boolean } | null;
};

// A one-day stage's dates and title ("Sun Nov 22"; with a time, "Tue Nov 24," and "7:00 PM").
function oneDay(day: string, time: string | null): Pick<CyStage, 'dates' | 'sep' | 'title'> {
  return time ? { dates: [`${shortDate(day)},`, time], sep: ' ', title: `${fullDate(day)}, ${time}` } : { dates: [shortDate(day)], sep: ' ', title: fullDate(day) };
}

// A range's dates ("Nov 10 to 20" in one month; "Oct 12" to "Nov 6" across months) and title.
function range(a: string, b: string): Pick<CyStage, 'dates' | 'sep' | 'title'> {
  const same = a.slice(0, 7) === b.slice(0, 7);
  return same
    ? { dates: [`${monthDay(a)} to ${atDay(b).getUTCDate()}`], sep: ' ', title: `${fullDate(a)} to ${fullDate(b)}` }
    : { dates: [monthDay(a), monthDay(b)], sep: ' to ', title: `${fullDate(a)} to ${fullDate(b)}` };
}

/** The Eastern day applications close on (closes_at is an instant), or null. */
export function closeDay(c: CyCycle): string | null {
  return c.closesAt ? easternDay(c.closesAt) : null;
}

/** The Eastern day applications open on, or null. */
export function openDay(c: CyCycle): string | null {
  return c.opensAt ? easternDay(c.opensAt) : null;
}

/**
 * The six stages. Applications follow cyclePhase (before-open = up, open = now, closed = done). Interviews: done after
 * their last day, now from their first day, else up. One-day stages: done once past, else up; no date = unset. A stage
 * that is done makes every dated stage before it done; with no stage "now", the first stage after the last done one is.
 */
export function stagesFor(c: CyCycle, today: string, now: string): CyStage[] {
  const phase = cyclePhase(now, c.opensAt, c.closesAt);
  const od = openDay(c);
  const cd = closeDay(c);
  const n = c.applied;
  const out: CyStage[] = [];

  // 1. Applications.
  const apps: CyStage = { key: 'applications', group: 'applications', name: 'Applications', state: 'unset', dates: null, sep: ' ', title: null, note: { kind: 'unset' }, drawn: null };
  if (od) {
    Object.assign(apps, cd ? range(od, cd) : { dates: [`From ${monthDay(od)}`], sep: ' ', title: fullDate(od) });
    if (phase === 'before-open') Object.assign(apps, { state: 'up', note: { kind: 'text', text: `Opens ${stageRel(today, od)}`, ink: false } });
    else if (phase === 'open') Object.assign(apps, { state: 'now', note: { kind: 'text', text: cd ? `Open · closes ${stageRel(today, cd)}` : 'Open', ink: true }, drawn: { kind: 'applied', n } });
    else Object.assign(apps, { state: 'done', note: { kind: 'closed' }, drawn: { kind: 'applied', n } });
  }
  out.push(apps);

  // 2. Interviews.
  const iv: CyStage = { key: 'interviews', group: 'interviews', name: 'Interviews', state: 'unset', dates: null, sep: ' ', title: null, note: { kind: 'unset' }, drawn: { kind: 'bar', what: 'booked', k: c.booked, n, ink: false } };
  if (c.interviewStart && c.interviewEnd) {
    Object.assign(iv, range(c.interviewStart, c.interviewEnd));
    if (daysFrom(today, c.interviewEnd) < 0) Object.assign(iv, { state: 'done', note: null });
    else if (daysFrom(today, c.interviewStart) <= 0) {
      const day = daysFrom(c.interviewStart, today) + 1;
      const of = daysFrom(c.interviewStart, c.interviewEnd) + 1;
      Object.assign(iv, { state: 'now', note: { kind: 'text', text: `Now · day ${day} of ${of}`, ink: true } });
    } else Object.assign(iv, { state: 'up', note: { kind: 'text', text: stageRel(today, c.interviewStart), ink: false } });
  }
  out.push(iv);

  // 3 to 6. The one-day stages.
  const single = (key: CyStage['key'], group: CyGroupId, name: string, day: string | null, time: string | null, drawn: CyStage['drawn']): CyStage => {
    if (!day) return { key, group, name, state: 'unset', dates: null, sep: ' ', title: null, note: { kind: 'unset' }, drawn };
    const past = daysFrom(today, day) < 0;
    return { key, group, name, ...oneDay(day, time), state: past ? 'done' : 'up', note: past ? null : { kind: 'text', text: stageRel(today, day), ink: false }, drawn };
  };
  out.push(single('scores', 'scoring', 'Scores due', c.scoresDue, null, { kind: 'bar', what: 'scored', k: c.scored, n, ink: true }));
  out.push(single('selection', 'selection', 'Selection meeting', c.selectionDay, c.selectionTime, null));
  out.push(single('award', 'award', 'Award announced', c.decisionDate, null, null));
  out.push(single('funds', 'award', 'Funds sent', c.fundsSent, null, null));

  // A done stage makes the dated stages before it done (a missing date stays "Date not set"). Applications follow
  // cyclePhase alone: they read Closed only when the phase is closed, even if a later stage is done.
  const lastDone = out.map((x) => x.state).lastIndexOf('done');
  out.forEach((x, i) => {
    if (x.key === 'applications') return;
    if (i < lastDone && (x.state === 'up' || x.state === 'now')) Object.assign(x, { state: 'done', note: null });
  });
  // One stage is now: the first "now", else the first stage after the last done one, even when its date is not set
  // (it keeps its "Date not set" words; live, the later stages have no date columns).
  const firstNow = out.findIndex((x) => x.state === 'now');
  out.forEach((x, i) => {
    if (x.state === 'now' && i !== firstNow) x.state = 'up';
  });
  const lastDoneNow = out.map((x) => x.state).lastIndexOf('done');
  if (firstNow < 0 && lastDoneNow >= 0 && lastDoneNow + 1 < out.length) {
    const nx = out[lastDoneNow + 1];
    if (nx.state === 'up' || nx.state === 'unset') nx.state = 'now';
  }
  return out;
}

/** The stage that is now (undefined when none). */
export function nowStage(stages: CyStage[]): CyStage | undefined {
  return stages.find((x) => x.state === 'now');
}

/* ---------------------------------------------------------------- the dated line (laptops) */

export type CyAxis = {
  segs: { left: number; width: number; kind: 'done' | 'now' | 'up' }[];
  pts: { left: number }[];
  nums: { n: number; left: number }[];
  today: number | null;
  labels: { text: string; left: number; cls: 'start' | 'mid' | 'end' | 'tday' }[];
};

/**
 * The dated line: from the day applications open to the last dated stage. A day sits at (days from the start + 1) / span
 * of the width (span = days + 3, the demo's spacing). Ranges are segments (ink done, gold now), one-day stages are points,
 * today is a line (only inside the range), and the first of each month is a label unless it would crowd another label.
 * Null when there is nothing to draw (no opening day or no later date).
 */
export function axisFor(c: CyCycle, stages: CyStage[], today: string): CyAxis | null {
  const start = openDay(c);
  if (!start) return null;
  const days = [closeDay(c), c.interviewStart, c.interviewEnd, c.scoresDue, c.selectionDay, c.decisionDate, c.fundsSent].filter((d): d is string => !!d && d > start);
  if (!days.length) return null;
  const end = days.reduce((a, b) => (b > a ? b : a));
  const span = daysFrom(start, end) + 3;
  const pos = (d: string) => ((daysFrom(start, d) + 1) / span) * 100;
  const st = (k: CyStage['key']) => stages.find((x) => x.key === k)?.state;
  const kind = (k: CyStage['key']): 'done' | 'now' | 'up' => (st(k) === 'done' ? 'done' : st(k) === 'now' ? 'now' : 'up');
  const ax: CyAxis = { segs: [], pts: [], nums: [], today: null, labels: [] };
  let num = 0;
  const cd = closeDay(c);
  if (cd) {
    ax.segs.push({ left: pos(start), width: pos(cd) - pos(start), kind: kind('applications') });
    ax.nums.push({ n: ++num, left: (pos(start) + pos(cd)) / 2 });
  } else num++;
  if (c.interviewStart && c.interviewEnd) {
    ax.segs.push({ left: pos(c.interviewStart), width: pos(c.interviewEnd) - pos(c.interviewStart), kind: kind('interviews') });
    ax.nums.push({ n: ++num, left: (pos(c.interviewStart) + pos(c.interviewEnd)) / 2 });
  } else num++;
  for (const d of [c.scoresDue, c.selectionDay, c.decisionDate, c.fundsSent]) {
    num++;
    if (!d) continue;
    ax.pts.push({ left: pos(d) });
    ax.nums.push({ n: num, left: pos(d) });
  }
  const inRange = today >= start && today <= end;
  if (inRange) ax.today = pos(today);
  ax.labels.push({ text: monthDay(start), left: 0, cls: 'start' });
  // First of each month strictly inside the range, unless within 8% of today's label or the ends.
  for (let d = addDays(`${start.slice(0, 7)}-01`, 32).slice(0, 7) + '-01'; d < end; d = addDays(d, 32).slice(0, 7) + '-01') {
    const p = pos(d);
    if (p < 8 || p > 92 || (ax.today != null && Math.abs(p - ax.today) < 8)) continue;
    ax.labels.push({ text: monthDay(d), left: p, cls: 'mid' });
  }
  if (ax.today != null) ax.labels.push({ text: 'Today', left: ax.today, cls: 'tday' });
  ax.labels.push({ text: monthDay(end), left: pos(end), cls: 'end' });
  return ax;
}

/* ---------------------------------------------------------------- the checklist */

/** The checklist's groups in order, with the stage that gives each its node and "Now". */
export const GROUPS: { id: CyGroupId; label: string; stage: CyStage['key'] }[] = [
  { id: 'applications', label: 'Applications', stage: 'applications' },
  { id: 'interviews', label: 'Interviews', stage: 'interviews' },
  { id: 'scoring', label: 'Scoring', stage: 'scores' },
  { id: 'selection', label: 'Selection', stage: 'selection' },
  { id: 'award', label: 'Award', stage: 'award' },
];

/**
 * The fixed steps of the Applications and Award groups, done or not, worked out from the cycle. Live (`mock` false) only
 * the steps the data backs: publish, open and close (the dates) and announcing the award (decisions_released_at). The
 * demo's "Collect the photo and story" and "Send the funds" have no data behind them, so they are drawn in mock mode only
 * (live, a real checklist task carries that work and counts once).
 */
export function fixedSteps(group: CyGroupId, c: CyCycle, now: string, mock = false): { label: string; done: boolean }[] {
  const phase = cyclePhase(now, c.opensAt, c.closesAt);
  if (group === 'applications') {
    const od = openDay(c);
    const cd = closeDay(c);
    return [
      // The page only shows a published cycle.
      { label: 'Publish the cycle', done: true },
      { label: od ? `Open applications, ${shortDate(od)}` : 'Open applications', done: phase !== 'before-open' && !!od },
      { label: cd ? `Close applications, ${shortDate(cd)}` : 'Close applications', done: phase === 'closed' && !!od },
    ];
  }
  if (group === 'award') {
    const announce = { label: c.decisionDate ? `Announce the award, ${shortDate(c.decisionDate)}` : 'Announce the award', done: c.released };
    return mock ? [announce, { label: 'Collect the photo and story', done: false }, { label: 'Send the funds', done: false }] : [announce];
  }
  return [];
}

/** "3 steps done", "3 steps" (none done) or "1 of 3 done". */
export function fixedWord(steps: { done: boolean }[]): string {
  const d = steps.filter((x) => x.done).length;
  if (d === steps.length) return `${steps.length} steps done`;
  if (d === 0) return `${steps.length} steps`;
  return `${d} of ${steps.length} done`;
}

/** "6 of 14": the fixed steps plus the rows (a fully done live cycle reaches all of them). */
export function progress(c: CyCycle, rows: CyRow[], now: string, mock = false): { done: number; total: number } {
  const fixed = [...fixedSteps('applications', c, now, mock), ...fixedSteps('award', c, now, mock)];
  return { done: fixed.filter((x) => x.done).length + rows.filter((r) => r.done).length, total: fixed.length + rows.length };
}

/* ---------------------------------------------------------------- the news card */

export type CyNews = { id: string; kicker: string; title: string; go: string; icon: 'send' | 'flag' };

/**
 * Mock mode (the demo): "Remind the 16" while that step is open, then the late "Share" step, then nothing. Live mode:
 * the first open step owned by me (late ones first, then the earliest due), "See it", else nothing.
 */
export function newsFor(rows: CyRow[], today: string, mock: { unbooked: number } | null): CyNews | null {
  if (mock) {
    const remind = rows.find((r) => r.act === 'remind' && !r.done);
    if (remind) return { id: remind.id, kicker: `${mock.unbooked} students not booked`, title: remind.title, go: 'Remind', icon: 'send' };
    const share = rows.find((r) => r.act === 'share' && !r.done);
    if (share) return { id: share.id, kicker: share.due && daysFrom(today, share.due) < 0 ? lateWord(today, share.due) : 'Next', title: share.title, go: 'Share', icon: 'send' };
    return null;
  }
  const mine = rows.filter((r) => !r.done && r.owner?.kind === 'me');
  if (!mine.length) return null;
  const pick = [...mine].sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.id.localeCompare(b.id))[0];
  const kicker = !pick.due ? 'Yours' : daysFrom(today, pick.due) < 0 ? lateWord(today, pick.due) : `Due ${stageRel(today, pick.due)}`;
  return { id: pick.id, kicker, title: pick.title, go: 'See it', icon: 'flag' };
}

/* ---------------------------------------------------------------- live tasks to steps */

const GROUP_WORDS: [RegExp, CyGroupId][] = [
  [/interview|pair|booking/i, 'interviews'],
  [/scor|rubric/i, 'scoring'],
  [/select|deliberat/i, 'selection'],
  [/award|announce|fund|photo|winner/i, 'award'],
  [/applica|publish|open|close|deadline/i, 'applications'],
];

/**
 * Which group a live task sits in: a stage word in the task's title, then in its checklist's title; then its type
 * (scoring, meeting); then its due day against the cycle's dates; else the group of the stage that is now (Interviews
 * when none is).
 */
export function classify(task: Row, listTitle: string, c: CyCycle, nowGroup: CyGroupId | null): CyGroupId {
  for (const text of [s(task.title), listTitle]) {
    for (const [rx, g] of GROUP_WORDS) if (rx.test(text)) return g;
  }
  if (task.type === 'scoring') return 'scoring';
  if (task.type === 'meeting') return 'selection';
  const due = task.due_on ? s(task.due_on).slice(0, 10) : null;
  if (due) {
    const cd = closeDay(c);
    if (cd && due <= cd) return 'applications';
    if (c.interviewEnd && due <= c.interviewEnd) return 'interviews';
    if (c.decisionDate && due <= c.decisionDate) return 'selection';
    if (c.decisionDate && due > c.decisionDate) return 'award';
  }
  return nowGroup ?? 'interviews';
}

/**
 * The link on a live step: Review for a budget approval (the bare approval page: a cycle checklist's task carries no
 * quarter plan id), the stage's page for interviews and scoring, else Tasks.
 */
export function linkFor(type: unknown, group: CyGroupId): { label: string; href: string } {
  if (type === 'approval') return { label: 'Review', href: approvalHref() };
  if (group === 'interviews') return { label: 'Open interviews', href: '/scholarships/interviews' };
  if (group === 'scoring') return { label: 'Open scoring', href: '/scholarships/scoring' };
  return { label: 'Open in Tasks', href: '/tasks' };
}

const GROUP_OWNER: Record<string, string> = { board: 'Board', all_board: 'All board members', interview_pairs: 'Interview pairs' };

/** Two-letter initials ("Dana Mercer" -> "DM"). */
function ini(name: string): string {
  const p = name.split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

/**
 * A task's owner: me when I am one of its people; else its first person by name (" +1" for each more); else its group
 * (the bot, the board ...); else null.
 */
export function ownerOf(task: Row, people: string[], staff: Map<string, { name: string; initials: string }>, me: { userId: string; name: string; initials: string }): CyOwner | null {
  if (people.includes(me.userId)) return { kind: 'me', label: people.length > 1 ? `${me.name} +${people.length - 1}` : me.name, initials: me.initials };
  if (people.length) {
    const p = staff.get(people[0]);
    const name = p?.name || 'Board member';
    return { kind: 'person', label: people.length > 1 ? `${name} +${people.length - 1}` : name, initials: p?.initials || ini(name) };
  }
  if (task.assignee_group === 'bot') return { kind: 'bot', label: 'BTX, automatic', initials: '' };
  const g = GROUP_OWNER[s(task.assignee_group)];
  return g ? { kind: 'group', label: g, initials: '' } : null;
}

/**
 * The live steps from the cycle's checklists (id, title, position), their tasks (id, title, type, due_on, status,
 * assignee_group, checklist_id, position, completed_at) and the tasks' assignees (task_id, user_id). Ordered by
 * checklist position, then task position, then id. Declined tasks are left out. Live steps carry no demo action.
 */
export function mapRows(lists: Row[], tasks: Row[], assignees: Row[], staff: Map<string, { name: string; initials: string }>, me: { userId: string; name: string; initials: string }, c: CyCycle, nowGroup: CyGroupId | null): CyRow[] {
  const listPos = new Map(lists.map((l, i) => [s(l.id), { i, title: s(l.title) }]));
  const people = new Map<string, string[]>();
  for (const a of [...assignees].sort((x, y) => s(x.user_id).localeCompare(s(y.user_id)))) {
    const k = s(a.task_id);
    people.set(k, [...(people.get(k) ?? []), s(a.user_id)]);
  }
  return [...tasks]
    // A declined task is not work to do: it neither counts nor shows as an open step.
    .filter((t) => listPos.has(s(t.checklist_id)) && t.status !== 'declined')
    .sort((a, b) => (listPos.get(s(a.checklist_id))?.i ?? 0) - (listPos.get(s(b.checklist_id))?.i ?? 0) || Number(a.position ?? 0) - Number(b.position ?? 0) || s(a.id).localeCompare(s(b.id)))
    .map((t) => {
      const group = classify(t, listPos.get(s(t.checklist_id))?.title ?? '', c, nowGroup);
      const done = t.status === 'done';
      return {
        id: s(t.id),
        group,
        title: s(t.title),
        owner: ownerOf(t, people.get(s(t.id)) ?? [], staff, me),
        done,
        doneAt: done && t.completed_at ? s(t.completed_at) : null,
        due: t.due_on ? s(t.due_on).slice(0, 10) : null,
        time: null,
        act: null,
        link: done ? null : linkFor(t.type, group),
      };
    });
}

/** Splits a list into chunks of `n` (a long id list would overflow the request URL). */
export function chunk<T>(xs: T[], n = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}
