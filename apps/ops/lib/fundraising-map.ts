// Pure logic for the refreshed Fundraising page (no database, no React), unit-tested in tests/fundraising-map.test.ts:
// the gift figures from gift rows, the newest gifts, the checklist steps from task rows, the step's eyebrow words, the
// news card, the nudge draft, the typed-gift parser (mock mode's "Log a gift") and the mock state changes it makes.
import { giftStats } from './money-logic';
import { GIFT_SOURCES, pct, type GiftSource } from './money-shared';
import { daysFrom, fullDate, MO, rel, weekday } from './refresh-time';
import type { FrCaps, FrChecklist, FrGift, FrOwner, FrSource, FrStep, FundraisingView } from './fundraising-view';

type Row = Record<string, unknown>;

/** "$9,800": whole dollars, as the page shows money (cents are rounded away, as the demo does). */
export function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

/** "$5,151": dollars rounded up, for money still to raise (never "$0 to go" while any cents are left). */
export function dollarsUp(cents: number): string {
  return `$${Math.ceil(cents / 100).toLocaleString('en-US')}`;
}

/** A count as a badge shows it: "99+" past 99. */
export function cnt(n: number): string {
  return n > 99 ? '99+' : String(n);
}

/** Whole percent of `part` in `whole` (0 when `whole` is 0). */
export { pct };

/** "Tue, Nov 10": the date beside the title. */
export function dateLabel(today: string): string {
  const [, m, d] = today.split('-').map(Number);
  return `${weekday(today)}, ${MO[m - 1]} ${d}`;
}

/** The source key of a gift row; anything unknown counts as an individual gift (the column's default). */
export function sourceOf(v: unknown): GiftSource {
  return GIFT_SOURCES.some((s) => s.key === v) ? (v as GiftSource) : 'individual';
}

/** The name of a source on the page ("Employer match and corporate"). */
export function sourceLabel(k: GiftSource): string {
  return GIFT_SOURCES.find((s) => s.key === k)?.label ?? 'Individual donors';
}

/** The figures of one year counted from every gift row (all years: a donor is "new" when none of their gifts is older). */
export function giftFigures(gifts: Row[], year: number) {
  const s = giftStats(gifts, String(year));
  return {
    raisedCents: s.raised_cents,
    q3Cents: s.q3_cents,
    donors: s.donors,
    newDonors: s.new_donors,
    monthlyDonors: s.monthly_donors,
    avgCents: s.avg_gift_cents,
    sources: s.sources.map((x): FrSource => ({ key: x.key, label: x.label, cents: x.cents })),
  };
}

/** The `n` newest gift rows: by gift day, then by when they were logged (created_at), then id, newest first. */
export function newestGifts(gifts: Row[], n = 5): Row[] {
  const key = (g: Row) => [String(g.gift_on ?? ''), String(g.created_at ?? ''), String(g.id)];
  return [...gifts]
    .filter((g) => g.gift_on)
    .sort((a, b) => {
      const [ka, kb] = [key(a), key(b)];
      for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return kb[i].localeCompare(ka[i]);
      return 0;
    })
    .slice(0, n);
}

/** Gift rows as "Recent gifts" draws them; `names` maps donor id to name (a missing donor is anonymous). */
export function mapGifts(rows: Row[], names: Map<string, string>): FrGift[] {
  return rows.map((g) => ({
    id: String(g.id),
    donor: g.donor_id ? (names.get(String(g.donor_id)) ?? null) : null,
    source: sourceOf(g.source),
    monthly: g.monthly === true,
    amountCents: Number(g.amount_cents ?? 0),
    giftOn: String(g.gift_on).slice(0, 10),
  }));
}

const GROUPS: Record<string, string> = { bot: 'BTX', board: 'Board', all_board: 'All board members', interview_pairs: 'Interview pairs' };

/** "Keith Dawson" -> "Keith". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/**
 * Checklist task rows as steps, in position order. The owner is the first assignee with a profile, then the task's group,
 * then nobody. Declined steps are left out (they are not part of the plan any more).
 */
export function mapSteps(tasks: Row[], assignees: Row[], profiles: Row[]): FrStep[] {
  const people = new Map(profiles.map((p) => [String(p.user_id), p]));
  return [...tasks]
    .filter((t) => t.status !== 'declined')
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0) || String(a.id).localeCompare(String(b.id)))
    .map((t) => {
      const a = assignees.filter((x) => x.task_id === t.id).map((x) => people.get(String(x.user_id))).find(Boolean);
      let owner: FrOwner = { kind: 'none' };
      if (a) {
        const name = String(a.display_name ?? '');
        owner = { kind: 'person', id: String(a.user_id), name, first: firstName(name), initials: String(a.initials ?? '') };
      } else if (t.assignee_group) owner = { kind: 'group', name: GROUPS[String(t.assignee_group)] ?? 'Board' };
      return { id: String(t.id), title: String(t.title ?? ''), kind: String(t.note ?? ''), owner, due: t.due_on ? String(t.due_on).slice(0, 10) : null, done: t.status === 'done' };
    });
}

/** The step that is up next: the first one not done. */
export function nextStep(steps: FrStep[]): FrStep | undefined {
  return steps.find((s) => !s.done);
}

/** The word at the start of a step's eyebrow: "Done", "2 days late" (drawn as the late tag) or "Fri", with the hover title. */
export function stepDue(today: string, s: FrStep): { kind: 'done' | 'late' | 'when' | 'none'; text: string; title: string } {
  if (!s.due) return { kind: s.done ? 'done' : 'none', text: s.done ? 'Done' : 'No date', title: s.done ? 'Done' : 'No due date' };
  if (s.done) return { kind: 'done', text: 'Done', title: fullDate(s.due) };
  const n = daysFrom(today, s.due);
  if (n < 0) return { kind: 'late', text: `${-n} day${n === -1 ? '' : 's'} late`, title: `Due ${fullDate(s.due)}` };
  return { kind: 'when', text: rel(today, s.due), title: `Due ${fullDate(s.due)}` };
}

/** True when the next step waits on someone other than the viewer (the "Waiting on Keith" line). */
export function waitsOnOther(s: FrStep | undefined, me: string): s is FrStep & { owner: Extract<FrOwner, { kind: 'person' }> } {
  return !!s && s.owner.kind === 'person' && s.owner.id !== me;
}

// "today", "tomorrow", "Friday", "next Friday", or "Tuesday, December 1": the due day inside the nudge's sentence.
function relWords(today: string, day: string): string {
  const n = daysFrom(today, day);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  const full = fullDate(day);
  const wd = full.split(',')[0];
  if (n > 0 && n <= 5) return wd;
  if (n > 0 && n <= 12) return `next ${wd}`;
  return full;
}

/** The drafted nudge for the next step's owner. */
export function nudgeText(today: string, s: FrStep, first: string): string {
  const due = s.due ? ` It's due ${relWords(today, s.due)}.` : '';
  return `Hi ${first}, how is "${s.title.toLowerCase()}" coming along?${due}`;
}

/** The news card: the money still to raise this year, or null once the goal is met (or there is none). */
export function fundraisingNews(goalCents: number | null, raisedCents: number): { left: number; goal: number } | null {
  if (goalCents == null || goalCents <= 0 || raisedCents >= goalCents) return null;
  return { left: goalCents - raisedCents, goal: goalCents };
}

/** What the board draws for each control, from the view's caps (live mode: every control false, "Coming soon" instead). */
export function frControls(caps: FrCaps, loadFailed = false) {
  return {
    /** The "Log a gift" row opens the typed line (false: the disabled "Coming soon" row). */
    giftForm: caps.logGift && !loadFailed,
    /** The N key opens the typed line. */
    nKey: caps.logGift && !loadFailed,
    /** "Saved · Undo" after a logged gift. */
    giftUndo: caps.logGift && caps.giftUndo,
    /** Steps are tick buttons (false: a plain done or not-done mark). */
    tickButtons: caps.tick,
    /** "Done · Undo" after a tick. */
    stepUndo: caps.tick,
    /** "Nudge <name>" and its draft on the next step. */
    nudge: caps.nudge,
  };
}

// ---------------------------------------------------------------- mock mode's "Log a gift"

/** A typed amount: "$45", "45.50", "1,200" -> cents and the text it came from, or null. */
export function parseAmount(text: string): { cents: number; raw: string } | null {
  const m = text.match(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?|\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\b/);
  if (!m) return null;
  const whole = (m[1] ?? m[3]).replace(/,/g, '');
  const frac = m[2] ?? m[4] ?? '';
  const cents = Number(whole) * 100 + (frac ? Math.round(Number(`0.${frac}`) * 100) : 0);
  return cents > 0 ? { cents, raw: m[0] } : null;
}

const SRCWORDS: [RegExp, GiftSource][] = [
  [/\b(match|employer|corporate|company|sponsor)\b/i, 'corporate'],
  [/\b(event|gala|cocktail|dinner)\b/i, 'event'],
  [/\b(grant)\b/i, 'grant'],
];

/** A typed gift line ("$50 Jordan Pierce monthly"): the amount, the source its words name, monthly, and the donor (the rest). */
export function parseGift(text: string): { cents: number | null; source: GiftSource; monthly: boolean; donor: string } {
  const a = parseAmount(text);
  let rest = a ? text.replace(a.raw, ' ') : text;
  let source: GiftSource = 'individual';
  for (const [rx, k] of SRCWORDS) {
    const m = rest.match(rx);
    if (m) {
      source = k;
      rest = rest.replace(m[0], ' ');
      break;
    }
  }
  const mm = rest.match(/\b(monthly|every month)\b/i);
  const monthly = !!mm;
  if (mm) rest = rest.replace(mm[0], ' ');
  rest = rest.replace(/\b(from|by)\b/gi, ' ').replace(/\s+/g, ' ').replace(/^[,\s-]+|[,\s-]+$/g, '').trim();
  return { cents: a ? a.cents : null, source, monthly, donor: rest };
}

/** The figures a logged gift changes (mock mode): what the demo adds, or with `sign` -1 takes away again (Undo). */
export type GiftTotals = Pick<FundraisingView, 'raisedCents' | 'donors' | 'newDonors' | 'monthlyDonors' | 'sources'>;

/** Adds (sign 1) or removes (sign -1) one gift from the totals; a new gift counts as a new donor, as in the demo. */
export function applyGift(t: GiftTotals, g: Pick<FrGift, 'amountCents' | 'source' | 'monthly'>, sign: 1 | -1): GiftTotals {
  return {
    raisedCents: t.raisedCents + sign * g.amountCents,
    donors: Math.max(0, t.donors + sign),
    newDonors: Math.max(0, t.newDonors + sign),
    monthlyDonors: Math.max(0, t.monthlyDonors + (g.monthly ? sign : 0)),
    sources: t.sources.map((s) => (s.key === g.source ? { ...s, cents: s.cents + sign * g.amountCents } : s)),
  };
}

/** A checklist after ticking one step done or open again. */
export function toggleStep(c: FrChecklist, id: string): FrChecklist {
  return { ...c, steps: c.steps.map((s) => (s.id === id ? { ...s, done: !s.done } : s)) };
}
