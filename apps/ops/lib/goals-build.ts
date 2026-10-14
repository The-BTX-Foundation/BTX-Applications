// Pure parts of the Goals loader: each goal card's value counted per `metric`, and the "Scholars funded, by award cycle"
// chart from scholarship_awards. No server imports, so tests can use them.
import { dateOnlyLabel } from './format';
import { dollars } from './team-dates';
import type { CycleBar, GoalCard, GoalStatus } from '@/mock/goals';

export type GoalRow = {
  id: string;
  title: string;
  metric: 'money_raised' | 'budget_spent' | 'checklist' | 'applicants_scored' | 'manual';
  status: GoalStatus;
  target_cents: number | null;
  target_count: number | null;
  checklist_id: string | null;
  cycle_id: string | null;
  manual_value: number | null;
};

/** What the cards count from, already summed for the goal's year. */
export type GoalFacts = {
  /** Sum of gifts.amount_cents in the year. */
  raisedCents: number;
  /** Sum of spending_entries.amount_cents in the year. */
  spentCents: number;
  /** Sum of budget_categories.budget_cents for the year (the budget goal's target when the goal has none). */
  budgetCents: number;
  /** Steps per checklist: done and total (tasks.checklist_id, not archived). */
  checklists: Record<string, { done: number; total: number }>;
  /** Per cycle: submitted applications, how many have both scores published, and the decision date. */
  cycles: Record<string, { scored: number; total: number; decision: string | null }>;
};

// Whole dollars on the cards ("$4,584", not "$4,583.75").
const usd = (cents: number) => dollars(Math.round(cents / 100) * 100);
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

// One goal card from its row and the counted facts. The phone shows the same measure as the laptop (O7).
export function goalCard(g: GoalRow, f: GoalFacts): GoalCard {
  const base = { id: g.id, title: g.title, status: g.status };
  const same = (c: Omit<GoalCard, 'phoneFoot' | 'id' | 'title' | 'status'>): GoalCard => ({ ...base, ...c, phoneFoot: c.foot });
  switch (g.metric) {
    case 'money_raised': {
      const target = g.target_cents ?? 0;
      const raised = f.raisedCents;
      const p = pct(raised, target);
      const foot = !target ? 'No target set.' : raised >= target ? `${p}%, goal passed. ${usd(raised - target)} over.` : `${p}% of the goal. ${usd(target - raised)} to go.`;
      return { ...same({ value: usd(raised), frac: target ? raised / target : 0, foot }), phoneUnit: 'raised' };
    }
    case 'budget_spent': {
      const target = g.target_cents ?? f.budgetCents;
      return same({ value: usd(f.spentCents), unit: 'spent', frac: target ? f.spentCents / target : 0, foot: target ? `of ${usd(target)} budgeted.` : 'No budget set.' });
    }
    case 'checklist': {
      const c = (g.checklist_id && f.checklists[g.checklist_id]) || { done: 0, total: 0 };
      const left = c.total - c.done;
      return same({ value: `${c.done} of ${c.total}`, unit: 'steps', frac: c.total ? c.done / c.total : 0, foot: left > 0 ? `${left} step${left === 1 ? '' : 's'} to go.` : c.total ? 'Every step done.' : 'No steps yet.' });
    }
    case 'applicants_scored': {
      const c = (g.cycle_id && f.cycles[g.cycle_id]) || { scored: 0, total: 0, decision: null };
      const foot = c.decision ? `Award by ${dateOnlyLabel(c.decision)}.` : `${c.total - c.scored} left to score.`;
      return same({ value: `${c.scored} of ${c.total}`, unit: 'scored', frac: c.total ? c.scored / c.total : 0, foot });
    }
    default: {
      const v = Number(g.manual_value ?? 0);
      if (g.target_cents !== null) {
        const t = g.target_cents;
        return same({ value: usd(v), frac: t ? v / t : 0, foot: `of ${usd(t)}.` });
      }
      const t = g.target_count ?? 0;
      return same({ value: t ? `${v} of ${t}` : String(v), frac: t ? v / t : 0, foot: t ? `${Math.max(0, t - v)} to go.` : 'Entered by hand.' });
    }
  }
}

export type AwardRow = { kind: 'main' | 'extra' | 'past'; cycle_id: string | null; past_term: string | null; past_term_starts: string | null };
export type CycleRow = { id: string; term: string; year: number; opens_at: string | null; decision_date: string | null; status: string };

// "Spring 2025" -> label "Spring", sub "2025", "Sp" / "25" on a phone.
function bar(term: string, year: number | null, count: number | null, sub?: string): CycleBar {
  const word = term.replace(/\s*\d{4}\s*/, '').trim() || term;
  const y = year ?? Number(/\d{4}/.exec(term)?.[0] ?? 0);
  return { label: word, phoneLabel: word.slice(0, 2), sub: sub ?? (y ? String(y) : ''), phoneSub: y ? String(y).slice(2) : '', count };
}

// Scholars funded per award cycle, oldest first: past awards by term, current awards by cycle. A published cycle with
// no award yet ends the chart as the dashed "?" bar, with its decision date under it.
export function awardBars(awards: AwardRow[], cycles: CycleRow[]): CycleBar[] {
  const groups = new Map<string, { term: string; year: number | null; start: string; count: number }>();
  for (const a of awards) {
    if (a.kind === 'past' && a.past_term) {
      const g = groups.get(`p:${a.past_term}`) ?? { term: a.past_term, year: null, start: a.past_term_starts ?? '', count: 0 };
      g.count += 1;
      groups.set(`p:${a.past_term}`, g);
    } else if (a.cycle_id) {
      const c = cycles.find((x) => x.id === a.cycle_id);
      if (!c) continue;
      const g = groups.get(`c:${c.id}`) ?? { term: c.term, year: c.year, start: c.opens_at?.slice(0, 10) ?? `${c.year}-12-31`, count: 0 };
      g.count += 1;
      groups.set(`c:${c.id}`, g);
    }
  }
  const out = [...groups.values()].sort((a, b) => a.start.localeCompare(b.start)).map((g) => bar(g.term, g.year, g.count));
  const pending = cycles
    .filter((c) => c.status !== 'draft' && !groups.has(`c:${c.id}`))
    .sort((a, b) => (b.opens_at ?? '').localeCompare(a.opens_at ?? ''))[0];
  if (pending) {
    const b = bar(pending.term, pending.year, null, pending.decision_date ? dateOnlyLabel(pending.decision_date).split(' ').slice(1).join(' ') : undefined);
    out.push({ ...b, label: `${b.label} ${pending.year}`.trim() });
  }
  return out;
}
