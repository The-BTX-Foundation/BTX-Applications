// Pure logic for the Budget page and its approval page (no database, no React), so all of it is unit-tested
// (tests/budget-map.test.ts): mapping database rows into the view (lib/budget-view.ts), the money sums the bars draw, the
// plain-word dates, the news card, the quick-add spending parser (mock only), the paging helper, and canDecide (the guard a
// live approve/decline must pass once money writes are switched on).
import { MO, WD, atDay, clock, daysFrom, easternDay, rel, shortDate } from './refresh-time';
import type { BudgetCaps, BuAuthor, BuCategory, BuComment, BuFunds, BuMsg, BuPlan, BuPlanStatus, BuSpend, BuStep, BuWho } from './budget-view';

export type Row = Record<string, unknown>;

// ---------------------------------------------------------------- money

/**
 * "$4,830": whole dollars, as the demo draws every figure. Under a dollar it shows the cents ("$0.49"), so a non-zero amount
 * (an "Over by", a "Leaves", a "Goes over") never reads "$0"; only exactly 0 is "$0".
 */
export function money(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const a = Math.abs(cents);
  if (a > 0 && a < 100) return `${sign}$0.${String(Math.round(a)).padStart(2, '0')}`;
  return `${sign}$${Math.round(a / 100).toLocaleString('en-US')}`;
}

/** Whole percent of `part` in `whole`; 0 when `whole` is 0. */
export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** What is still planned for a category this quarter: the plan minus what the quarter already spent (never below 0). */
export function leftOf(c: Pick<BuCategory, 'planCents' | 'quarterSpentCents'>): number {
  return Math.max(0, c.planCents - c.quarterSpentCents);
}

export type BuTotals = { budget: number; spent: number; left: number; plan: number; after: number };

/** The year's totals: budget, spent so far, still planned, the whole plan, and spent + still planned ("after"). */
export function totals(cats: Pick<BuCategory, 'budgetCents' | 'spentCents' | 'planCents' | 'quarterSpentCents'>[]): BuTotals {
  let budget = 0;
  let spent = 0;
  let left = 0;
  let plan = 0;
  for (const c of cats) {
    budget += c.budgetCents;
    spent += c.spentCents;
    left += leftOf(c);
    plan += c.planCents;
  }
  return { budget, spent, left, plan, after: spent + left };
}

/** The line under the year bar: over, exactly used up, or what it leaves. */
export function yearCaption(t: BuTotals): { kind: 'over' | 'exact' | 'left'; cents: number } {
  if (t.after > t.budget) return { kind: 'over', cents: t.after - t.budget };
  if (t.after === t.budget) return { kind: 'exact', cents: 0 };
  return { kind: 'left', cents: t.budget - t.after };
}

// ---------------------------------------------------------------- names and statuses

/** "Operations (website, software, filing)" -> name "Operations", sub "website, software, filing". */
export function splitName(full: string): { name: string; sub: string | null } {
  const m = full.trim().match(/^(.*?)\s*\((.+)\)\s*$/);
  return m ? { name: m[1], sub: m[2] } : { name: full.trim(), sub: null };
}

/** budget_quarter_plans.status -> the page's status (no row or a draft = "none"). */
export function planStatus(raw: unknown): BuPlanStatus {
  if (raw === 'awaiting_approval') return 'waiting';
  if (raw === 'approved') return 'approved';
  if (raw === 'declined') return 'declined';
  return 'none';
}

/** "Keith Dawson" -> "Keith". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/**
 * True only when a plan may be approved or declined right now: a real plan row and approval task, still awaiting approval.
 * A stale page (the plan was decided elsewhere since it loaded) must not decide it again; the live write (when money writes are
 * switched on) also filters on status = 'awaiting_approval' so the database refuses it too.
 */
export function canDecide(plan: Pick<BuPlan, 'id' | 'taskId' | 'status'>): boolean {
  return plan.id !== '' && plan.taskId !== '' && plan.status === 'waiting';
}

// ---------------------------------------------------------------- steps

/**
 * Which steps show as done and which one is "Now". The approval step is done exactly when the plan is approved. A declined
 * plan goes back to its drafter, so the step before the approval (the drafting step) shows as not done again.
 */
export function stepMarks(steps: Pick<BuStep, 'done' | 'approval'>[], status: BuPlanStatus): { done: boolean[]; now: number } {
  const ai = steps.findIndex((s) => s.approval);
  const done = steps.map((s, i) => (s.approval ? status === 'approved' : s.done && !(status === 'declined' && i === ai - 1)));
  return { done, now: done.indexOf(false) };
}

// ---------------------------------------------------------------- words for dates

/** "Tue, Nov 10": the date beside the title. */
export function headDate(today: string): string {
  const d = atDay(today);
  return `${WD[d.getUTCDay()]}, ${MO[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** A past day in plain words: "Today", "Yesterday", "Sun" (this past week), then "Sep 30"; a future day reads as rel(). */
export function pastWord(today: string, day: string): string {
  const n = daysFrom(today, day);
  if (n === 0) return 'Today';
  if (n === -1) return 'Yesterday';
  if (n < -1 && n >= -6) return WD[atDay(day).getUTCDay()];
  if (n < -6) {
    const d = atDay(day);
    return `${MO[d.getUTCMonth()]} ${d.getUTCDate()}`;
  }
  return rel(today, day);
}

/** "Done yesterday", "Done Sun", "Done Sep 30" (today and yesterday in lower case, as the demo writes them). */
export function doneWord(today: string, day: string): string {
  const w = pastWord(today, day);
  return `Done ${w === 'Today' || w === 'Yesterday' ? w.toLowerCase() : w}`;
}

/** The plan heading's right side: "Due Fri", "Due Thu Dec 31", or "2 days late" once past. */
export function dueWord(today: string, day: string): string {
  return daysFrom(today, day) < 0 ? rel(today, day) : `Due ${rel(today, day)}`;
}

/** A step's due day as the demo words it: a past day plainly ("Sun", "Sep 30"), else "Today", "Fri", "Next Mon". */
export function stepWhen(today: string, day: string): string {
  return daysFrom(today, day) < 0 ? pastWord(today, day) : rel(today, day);
}

/** A message or comment time: the Eastern clock time today, else "Yesterday", "Sun" or "Sep 30". Null = "just now". */
export function msgTime(today: string, at: string | null): string {
  if (!at) return 'just now';
  const day = easternDay(at);
  return day === today ? clock(at) : pastWord(today, day);
}

// ---------------------------------------------------------------- quarters

/** The first day of a quarter and the first day after it ("2026-10-01", "2027-01-01"). */
export function quarterRange(year: number, q: number): { from: string; to: string } {
  const m = (q - 1) * 3 + 1;
  const from = `${year}-${String(m).padStart(2, '0')}-01`;
  const to = q === 4 ? `${year + 1}-01-01` : `${year}-${String(m + 3).padStart(2, '0')}-01`;
  return { from, to };
}

/** The quarter before (Q1 2027 -> Q4 2026). */
export function prevQuarter(year: number, q: number): { year: number; q: number } {
  return q === 1 ? { year: year - 1, q: 4 } : { year, q: q - 1 };
}

// ---------------------------------------------------------------- the news card

export type BuNews = { gold: boolean; icon: 'approve' | 'wait'; kicker: string; title: string; go: string };

/**
 * The one card under the title. Waiting: gold "Needs your approval" when the approval is the viewer's (or a group's), else
 * "Waiting on <name>". No plan yet: "Waiting on <drafter>". Declined: waiting on the revised plan. Approved: no card.
 */
export function newsFor(plan: Pick<BuPlan, 'status' | 'from' | 'quarter'>, planCents: number, approver: BuWho | null): BuNews | null {
  const q = `Q${plan.quarter}`;
  const waitOn = plan.from ? `Waiting on ${plan.from.first}` : 'Waiting on a draft';
  if (plan.status === 'waiting') {
    const mine = !approver || approver.kind !== 'person' || approver.me;
    return { gold: mine, icon: mine ? 'approve' : 'wait', kicker: mine ? 'Needs your approval' : `Waiting on ${firstName(approver.kind === 'person' ? approver.name : '')}`, title: `${q} plan, ${money(planCents)}`, go: 'Review' };
  }
  if (plan.status === 'none') return { gold: false, icon: 'wait', kicker: waitOn, title: `${q} plan draft`, go: 'See it' };
  if (plan.status === 'declined') return { gold: false, icon: 'wait', kicker: waitOn, title: `Revised ${q} plan`, go: 'See it' };
  return null;
}

// ---------------------------------------------------------------- quick-add spending (mock mode only)

/** Money in a typed line: "$45", "45.50", "1,200" -> dollars and the matched text, or null. */
export function parseAmount(text: string): { value: number; raw: string } | null {
  const m = text.match(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?|\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\b/);
  if (!m) return null;
  const whole = (m[1] || m[3]).replace(/,/g, '');
  const cents = m[2] || m[4] || '';
  return { value: Number(whole) + (cents ? Number(`0.${cents}`) : 0), raw: m[0] };
}

// Words that pick a category, matched against the start of the category's name.
const CATWORDS: [RegExp, string][] = [
  [/\b(website|software|filing|domain|hosting|ops|operations)\b/i, 'operations'],
  [/\b(newsletter|instagram|outreach|ads?)\b/i, 'outreach'],
  [/\b(nsbe|convention|sponsor|sponsorship|sponsorships)\b/i, 'sponsorship'],
  [/\b(certification|certifications|cert|course|exam)\b/i, 'certification'],
  [/\b(scholarship|scholarships|award)\b/i, 'scholarship'],
];

/** "$45 domain renewal, website" -> 45 dollars, the Operations category's id, title "Domain renewal". */
export function parseSpend(text: string, cats: Pick<BuCategory, 'id' | 'name'>[]): { dollars: number | null; catId: string | null; title: string } {
  const a = parseAmount(text);
  let catId: string | null = null;
  let title = text;
  if (a) title = title.replace(a.raw, ' ');
  for (const [rx, start] of CATWORDS) {
    const m = title.match(rx);
    if (!m) continue;
    catId = cats.find((c) => c.name.toLowerCase().startsWith(start))?.id ?? null;
    // A trailing category word ("…, website") is a tag, not part of what it paid for.
    const w = title.trim().split(/\s+/);
    if (w.length >= 3 && new RegExp(`^${rx.source}$`, 'i').test(w[w.length - 1])) title = w.slice(0, -1).join(' ');
    break;
  }
  title = title.replace(/\s+/g, ' ').replace(/^[,\s-]+|[,\s-]+$/g, '').trim();
  if (title) title = title[0].toUpperCase() + title.slice(1);
  return { dollars: a ? a.value : null, catId, title };
}

// ---------------------------------------------------------------- caps

/** Mock mode: the demo's whole flow. */
export function mockCaps(): BudgetCaps {
  return { approve: true, decline: true, undo: true, logSpend: true, funds: true, comment: true, chat: true, nudge: true };
}

/**
 * Live mode. Money writes stay off (owner, 2026-10-12): approve, decline, undo, log spending and funds are "Coming soon".
 * Comments, chat and nudge have no backed write on this page (comment and chat are mock-only in the spec; a nudge would need
 * the batch-1 chat writers): not drawn.
 */
export function liveCaps(): BudgetCaps {
  return { approve: false, decline: false, undo: false, logSpend: false, funds: false, comment: false, chat: false, nudge: false };
}

// ---------------------------------------------------------------- paged reads

/** Rows per request (the database API's silent cap). */
export const BU_PAGE = 1000;
/** The most pages one read may take; reaching it is a load error, never a partial sum. */
export const BU_MAX_PAGES = 20;
/** Ids per `in (...)` read. */
export const BU_ID_CHUNK = 100;

/** Thrown when a read reached the page ceiling and more rows may exist (the page shows its load error). */
export class BudgetReadTruncated extends Error {
  constructor(public readonly table: string) {
    super(`Budget read of ${table} reached ${BU_MAX_PAGES} pages`);
    this.name = 'BudgetReadTruncated';
  }
}

/** Reads every row through `fetchPage(from, to)`: each page starts after the rows read so far, an empty page ends it. */
export async function pageAll<T>(table: string, fetchPage: (from: number, to: number) => Promise<T[]>, size = BU_PAGE, max = BU_MAX_PAGES): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < max; p++) {
    const rows = await fetchPage(out.length, out.length + size - 1);
    if (rows.length === 0) return out;
    out.push(...rows);
  }
  throw new BudgetReadTruncated(table);
}

/** Splits ids into chunks of `size`. */
export function chunks<T>(ids: T[], size = BU_ID_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------- row mapping (live mode)

export type People = Map<string, { name: string; initials: string }>;

/** A person from staff_profiles by user id ("Someone" when the profile is missing). */
export function author(people: People, id: unknown, me: string): BuAuthor {
  const p = people.get(String(id));
  return { name: p?.name ?? 'Someone', initials: p?.initials ?? '', me: String(id) === me };
}

/**
 * budget_category_totals row + what the quarter spent in it -> a category. `quarter` picks the plan column (q1_plan_cents ..
 * q4_plan_cents); `planned` false (no plan, or still a draft: the view sums plan lines whatever the plan's status) draws no
 * plan amount.
 */
export function mapCategory(r: Row, quarterSpent: Map<string, number>, quarter = 4, planned = true): BuCategory {
  const { name, sub } = splitName(String(r.name ?? ''));
  const id = String(r.category_id);
  const planCents = planned ? Number(r[`q${quarter}_plan_cents`] ?? 0) : 0;
  return { id, name, sub, budgetCents: Number(r.budget_cents ?? 0), spentCents: Number(r.spent_cents ?? 0), quarterSpentCents: quarterSpent.get(id) ?? 0, planCents, isNew: false };
}

/** The quarter (1-4) an Eastern day ("2026-11-10") falls in. */
export function quarterOf(day: string): number {
  return Math.ceil(Number(day.slice(5, 7)) / 3);
}

/** A database id the page may ask for (?plan=): a uuid. Anything else is "That plan isn't available." without a read. */
export function isPlanId(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/**
 * Which year and quarter to draw when no plan row was picked (no ?plan=, none awaiting approval, none for this quarter):
 * this quarter when this year has a budget (or there is no budget year at all), else the newest budget year (its Q4 when it
 * is past, its Q1 when it is ahead).
 */
export function fallbackQuarter(today: string, years: number[]): { year: number; quarter: number } {
  const year = Number(today.slice(0, 4));
  const quarter = quarterOf(today);
  if (!years.length || years.includes(year)) return { year, quarter };
  const newest = Math.max(...years);
  return { year: newest, quarter: newest < year ? 4 : 1 };
}

const GROUPS: Record<string, string> = { bot: 'BTX', board: 'Board', all_board: 'All board members', interview_pairs: 'Interview pairs' };

/** A tasks row (+ its first assignee) -> a step. */
export function mapStep(t: Row, assignee: string | undefined, people: People, me: string): BuStep {
  const p = assignee ? people.get(assignee) : undefined;
  const who: BuWho = assignee && p ? { kind: 'person', name: p.name, initials: p.initials, me: assignee === me } : t.assignee_group ? { kind: 'group', name: GROUPS[String(t.assignee_group)] ?? 'Board' } : { kind: 'none' };
  return {
    id: String(t.id),
    title: String(t.title ?? ''),
    who,
    due: (t.due_on as string | null) ?? null,
    done: t.status === 'done',
    doneOn: t.completed_at ? easternDay(String(t.completed_at)) : null,
    approval: t.type === 'approval',
  };
}

/** task_comments row -> a comment. */
export function mapComment(r: Row, people: People, me: string): BuComment {
  return { id: String(r.id), by: author(people, r.author_id, me), at: String(r.created_at), body: String(r.body ?? '') };
}

/** spending_entries row (with budget_categories(name)) -> a spending row. */
export function mapSpend(r: Row): BuSpend {
  const cat = (r.budget_categories as { name?: string } | null)?.name ?? '';
  return { id: String(r.id), on: String(r.spent_on), categoryId: r.category_id ? String(r.category_id) : null, category: splitName(cat).name, title: String(r.description ?? ''), cents: Number(r.amount_cents ?? 0) };
}

/** funds_snapshots row -> funds on hand (null = none recorded). */
export function mapFunds(r: Row | undefined, people: People, me: string): BuFunds {
  if (!r) return null;
  return { cents: Number(r.amount_cents ?? 0), asOf: String(r.as_of).slice(0, 10), by: r.recorded_by ? author(people, r.recorded_by, me) : null };
}

/** chat_messages row -> a message (a bot message is "BTX"). */
export function mapMsg(r: Row, people: People, me: string): BuMsg {
  const by = r.is_bot ? { name: 'BTX', initials: 'BT', me: false } : author(people, r.author_id, me);
  return { id: String(r.id), by, at: String(r.created_at), body: String(r.body ?? '') };
}

/** The plan row (or none) + its approval task + steps -> the plan. `quarter` is the quarter that was read. */
export function mapPlan(p: Row | undefined, approval: BuStep | undefined, steps: BuStep[], people: People, me: string, quarter: number): BuPlan {
  // Who it goes back to: the submitter, else the owner of the step before the approval (the drafting step).
  const sub = p?.submitted_by ? people.get(String(p.submitted_by))?.name : undefined;
  const ai = steps.findIndex((s) => s.approval);
  const drafter = ai > 0 ? steps[ai - 1].who : null;
  const fromName = sub ?? (drafter && drafter.kind === 'person' ? drafter.name : null);
  const decided = p?.decided_by ? people.get(String(p.decided_by)) : undefined;
  return {
    id: p ? String(p.id) : '',
    taskId: approval?.id ?? '',
    quarter: p ? Number(p.quarter ?? quarter) : quarter,
    status: planStatus(p?.status),
    due: approval?.due ?? null,
    from: fromName ? { name: fromName, first: firstName(fromName) } : null,
    declineNote: (p?.decline_note as string | null) ?? null,
    decidedBy: p?.decided_by ? { name: decided?.name ?? 'Someone', me: String(p.decided_by) === me } : null,
    decidedAt: (p?.decided_at as string | null) ?? null,
  };
}

/** The plan's lines in order: biggest plan amount first, ties in category order. */
export function lineOrder(cats: Pick<BuCategory, 'id' | 'planCents'>[]): string[] {
  return cats
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.planCents - a.c.planCents || a.i - b.i)
    .map((x) => x.c.id);
}

/** Sum of spending per category id. */
export function sumByCategory(rows: Pick<BuSpend, 'categoryId' | 'cents'>[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) if (r.categoryId) m.set(r.categoryId, (m.get(r.categoryId) ?? 0) + r.cents);
  return m;
}

/** "Fri Nov 13" etc. for hover titles of a day (re-exported for the page). */
export { shortDate };
