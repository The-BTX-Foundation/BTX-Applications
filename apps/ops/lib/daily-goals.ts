// Pure logic for the Goals page: each goal card's number counted from the tables, and the "scholars funded by award cycle"
// bars. No server imports, so it is unit-tested (tests/daily-goals.test.ts).
import { dateOnlyLabel, shortDate } from './format';
import { dollars, type Raw } from './daily-tasks';
import type { CycleBar, GoalCard, GoalStatus } from '@/mock/goals';

const str = (v: unknown) => String(v ?? '');
const num = (v: unknown) => Number(v ?? 0);

export type GoalFacts = {
  year: number;
  /** gifts this year, cents */
  raisedCents: number;
  /** spending this year and the year's total budget, cents */
  spentCents: number;
  budgetCents: number;
  /** tasks per checklist: done / total */
  checklistSteps: Record<string, { done: number; total: number }>;
  /** applications in a cycle and how many have both scores published */
  cycleScores: Record<string, { scored: number; applications: number; decisionDate: string | null }>;
  /** the cycle used when a goal names none */
  currentCycleId: string | null;
};

const pct = (n: number) => Math.round(n * 100);
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** One goal card from a `goals` row and the counted facts. */
export function goalCard(g: Raw, f: GoalFacts): GoalCard {
  const id = str(g.id);
  const title = str(g.title);
  const stored = str(g.status) as GoalStatus;
  const base = { id, title };
  switch (str(g.metric)) {
    case 'money_raised': {
      const target = g.target_cents ? num(g.target_cents) : 0;
      const raised = f.raisedCents;
      const over = target > 0 && raised >= target;
      const frac = target > 0 ? raised / target : 0;
      const foot = target === 0 ? 'No target set.' : over ? `${pct(frac)}%, goal passed.${raised > target ? ` ${dollars(raised - target)} over.` : ''}` : `${pct(frac)}% of the goal. ${dollars(target - raised)} to go.`;
      return { ...base, status: over && stored !== 'missed' ? 'met' : stored, value: dollars(raised), phoneUnit: 'raised', frac: clamp(frac), foot, phoneFoot: foot };
    }
    case 'budget_spent': {
      const budget = g.target_cents ? num(g.target_cents) : f.budgetCents;
      const frac = budget > 0 ? f.spentCents / budget : 0;
      const foot = budget > 0 ? `of ${dollars(budget)} for ${f.year}.` : 'No budget set yet.';
      return { ...base, status: stored, value: dollars(f.spentCents), unit: 'spent', frac: clamp(frac), foot, phoneFoot: foot };
    }
    case 'checklist': {
      const s = f.checklistSteps[str(g.checklist_id)] ?? { done: 0, total: 0 };
      const left = s.total - s.done;
      const foot = s.total === 0 ? 'No steps yet.' : left === 0 ? 'All steps done.' : `${left} ${left === 1 ? 'step' : 'steps'} to go.`;
      const met = s.total > 0 && left === 0;
      return { ...base, status: met && stored !== 'missed' ? 'met' : stored, value: `${s.done} of ${s.total}`, unit: 'steps', frac: s.total > 0 ? s.done / s.total : 0, foot, phoneFoot: foot };
    }
    case 'applicants_scored': {
      const cid = g.cycle_id ? str(g.cycle_id) : f.currentCycleId;
      const s = (cid && f.cycleScores[cid]) || { scored: 0, applications: 0, decisionDate: null };
      const foot = s.decisionDate ? `Award by ${dateOnlyLabel(s.decisionDate)}.` : 'No award date yet.';
      return { ...base, status: stored, value: `${s.scored} of ${s.applications}`, unit: 'scored', frac: s.applications > 0 ? s.scored / s.applications : 0, foot, phoneFoot: foot };
    }
    default: {
      const target = num(g.target_count);
      const v = num(g.manual_value);
      const foot = target > 0 ? `${pct(clamp(v / target))}% of the goal.` : 'Entered by hand.';
      return { ...base, status: target > 0 && v >= target && stored !== 'missed' ? 'met' : stored, value: target > 0 ? `${v} of ${target}` : String(v), frac: target > 0 ? clamp(v / target) : 0, foot, phoneFoot: foot };
    }
  }
}

// "Fall 2026" -> { word: "Fall", year: "2026" }; a term with no year takes the fallback year.
function splitTerm(term: string, fallbackYear: number): { word: string; year: string } {
  const m = /^(.*?)\s*(\d{4})$/.exec(term.trim());
  return m ? { word: m[1] || term, year: m[2] } : { word: term, year: String(fallbackYear) };
}

const sortKey = (term: string, year: number) => year * 10 + (/spring/i.test(term) ? 1 : /summer/i.test(term) ? 2 : /fall/i.test(term) ? 3 : 4);

/** Scholars funded per award cycle, oldest first. A published cycle with no awards yet is the dashed "?" bar at the end. */
export function cycleBars(awards: Raw[], cycles: Raw[]): CycleBar[] {
  const byCycle = new Map(cycles.map((c) => [str(c.id), c]));
  const groups = new Map<string, { label: string; year: string; n: number; key: number }>();
  for (const a of awards) {
    const c = a.cycle_id ? byCycle.get(str(a.cycle_id)) : undefined;
    let k: string;
    let t: { word: string; year: string };
    if (c) {
      k = `c:${str(c.id)}`;
      t = splitTerm(str(c.term), num(c.year));
    } else if (a.past_term) {
      k = `p:${str(a.past_term)}`;
      t = splitTerm(str(a.past_term), new Date().getFullYear());
    } else continue;
    const g = groups.get(k) ?? { label: t.word, year: t.year, n: 0, key: sortKey(t.word, Number(t.year)) };
    g.n += 1;
    groups.set(k, g);
  }
  const bars: CycleBar[] = [...groups.values()]
    .sort((a, b) => a.key - b.key)
    .map((g) => ({ label: g.label, phoneLabel: g.label.slice(0, 2), sub: g.year, phoneSub: g.year.slice(2), count: g.n }));
  // The cycle being decided: published, with no awards yet.
  const decided = new Set(awards.map((a) => str(a.cycle_id)));
  const open = cycles.filter((c) => c.status === 'published' && !decided.has(str(c.id))).sort((a, b) => num(b.year) - num(a.year))[0];
  if (open) {
    const t = splitTerm(str(open.term), num(open.year));
    bars.push({ label: `${t.word} ${t.year}`, phoneLabel: t.word.slice(0, 2), sub: open.decision_date ? shortDate(str(open.decision_date)) : t.year, phoneSub: t.year.slice(2), count: null });
  }
  return bars;
}

/** The years in the Year over year table: the three before this one. */
export function yoyYears(year: number): number[] {
  return [year - 3, year - 2, year - 1];
}
