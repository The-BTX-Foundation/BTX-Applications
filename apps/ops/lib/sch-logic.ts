// Pure rules the Scholarships pages share in live mode: the weighted score, where an application stands for the
// signed-in person, the ranking labels, and the short messages for database errors. No database calls here, so the
// unit tests (tests/sch-logic.test.ts) can check every rule without a server.
import { dayLabel } from './format';
import type { ProgressStep, Scoring, ScoreCell, Stage } from '@/mock/scoring';

export type WeightedCriterion = { key: string; weight: number };

/** Weighted score over the picked criteria, rounded to 2 places: the same rule as the database's scores_check(). */
export function weightedScore(criteria: WeightedCriterion[], picks: Record<string, number>): number | null {
  let sum = 0;
  let w = 0;
  for (const c of criteria) {
    const v = picks[c.key];
    if (v) {
      sum += c.weight * v;
      w += c.weight;
    }
  }
  return w > 0 ? Math.round((sum / w) * 100) / 100 : null;
}

/** The text of whatever a Supabase call returned as an error. */
function errText(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  const e = err as { message?: string; code?: string };
  return `${e.code ?? ''} ${e.message ?? ''}`;
}

/** A short line for a failed score save or publish. */
export function scoreErrorMessage(err: unknown): string {
  const t = errText(err);
  if (/publish_needs_all_criteria/.test(t)) return 'Publishing needs every criterion scored.';
  if (/invalid_pick|unknown_criteria/.test(t)) return 'That score is not on the rubric. Reload the page and try again.';
  if (/application_not_found/.test(t)) return 'That application is not open for scoring.';
  if (/row-level security|42501/.test(t)) return 'You can only score an applicant you interviewed, and only until you publish.';
  return "That didn't save. Try again.";
}

/** A short line for a failed "Funds sent" (the function mark_award_funds_sent). */
export function fundsErrorMessage(err: unknown): string {
  const t = errText(err);
  const year = /no_scholarship_category:(\d{4})/.exec(t)?.[1];
  if (year) return `Add a Scholarships category to the ${year} budget first, so the payment can be logged.`;
  if (/already_paid/.test(t)) return 'Funds are already marked as sent for this award.';
  if (/no_amount/.test(t)) return 'This award has no amount yet. Set it before marking funds sent.';
  if (/award_not_found/.test(t)) return 'That award was not found.';
  return "That didn't save. Try again.";
}

// ---- where an application stands (Applicants list) ---------------------------------------------------------------

export type PairPerson = { id: string; name: string; initials: string };

export type StandingInput = {
  now: Date;
  /** The start of the application's active booking, or null when nothing is booked. */
  interviewAt: string | null;
  /** The two interviewers, or [] when nobody is paired yet (or the reader may not see the pair). */
  pair: PairPerson[];
  meId: string;
  /** The signed-in person's own score on this application, if any. */
  mine: { criteriaCount: number; published: boolean; weighted: number | null } | null;
  /** Everyone's progress without values (admin and board only); null when the reader may not see it. */
  progress: { scorerId: string; published: boolean }[] | null;
  /** The visible score summary: two published scores and their combined score once both are in. */
  released: { combined: number } | null;
  interviewSummary: string | null;
  criteriaTotal: number;
  /** "Fri Oct 16" or "" for the selection meeting and award steps. */
  selectionLabel: string;
  awardLabel: string;
};

// Eastern calendar days from a to b.
function easternDays(a: Date, b: Date): number {
  const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
  return Math.round((Date.parse(ymd(b)) - Date.parse(ymd(a))) / 86_400_000);
}

/** "Interview today", "Interview tomorrow", "Interview Tue". */
export function upcomingLabel(at: string, now: Date): string {
  const d = easternDays(now, new Date(at));
  if (d <= 0) return 'Interview today';
  if (d === 1) return 'Interview tomorrow';
  return `Interview ${dayLabel(at).split(' ')[0]}`;
}

function steps(at: 'interview' | 'scoring' | 'selection', i: StandingInput, note?: string): ProgressStep[] {
  const now = at === 'interview' ? 1 : at === 'scoring' ? 2 : 3;
  const state = (k: number): ProgressStep['state'] => (k < now ? 'done' : k === now ? 'now' : 'next');
  return [
    { label: 'Applied', state: state(0) },
    { label: 'Interviewed', state: state(1), note: at === 'interview' && i.interviewAt ? dayLabel(i.interviewAt) : undefined },
    { label: at === 'scoring' ? 'Scored, now' : 'Scored', state: state(2), note: at === 'scoring' ? note : undefined },
    { label: 'Selection meeting', state: state(3), note: i.selectionLabel || undefined },
    { label: 'Award', state: state(4), note: i.awardLabel || undefined },
  ];
}

/** Where one application stands for the signed-in person: the stage pill, the score cell, the steps and the action. */
export function standing(i: StandingInput): Scoring {
  const interviewers = i.pair.map((p) => p.initials);
  const names = i.pair.map((p) => p.name);
  const base = { interviewers, names, summary: i.interviewSummary };
  const none: ScoreCell = { kind: 'none', line1: '' };
  const make = (group: Scoring['group'], stage: Stage, score: ScoreCell, progress: ProgressStep[], action: string): Scoring => ({ ...base, group, stage, score, progress, action });

  if (i.released) {
    return make('scored', { kind: 'scored', label: 'Scored' }, { kind: 'avg', line1: i.released.combined.toFixed(1) }, steps('selection', i), 'Open application');
  }
  if (!i.interviewAt) return make('attention', { kind: 'none', label: 'Interview not booked' }, none, steps('interview', i), 'Open application');
  if (new Date(i.interviewAt) > i.now) {
    return make('attention', { kind: 'interview', label: upcomingLabel(i.interviewAt, i.now) }, none, steps('interview', i), 'Open application');
  }
  if (i.pair.length < 2) return make('attention', { kind: 'none', label: 'Interviewers not paired' }, none, steps('scoring', i, 'Nobody is paired to score yet'), 'Open application');

  const mineIdx = i.pair.findIndex((p) => p.id === i.meId);
  const pubIds = new Set((i.progress ?? []).filter((p) => p.published).map((p) => p.scorerId));
  if (mineIdx >= 0) {
    const other = i.pair[1 - mineIdx];
    const otherPub = pubIds.has(other.id);
    const otherFirst = other.name.split(' ')[0];
    if (i.mine?.published) {
      return make(
        'attention',
        { kind: 'waiting', label: `Waiting on ${other.name}` },
        { kind: 'avg', line1: (i.mine.weighted ?? 0).toFixed(1), line2: '1 of 2' },
        steps('scoring', i, `1 of 2 published: you published, ${otherFirst} has not`),
        'Open application',
      );
    }
    const pubNote = `${otherPub ? 1 : 0} of 2 published${otherPub ? `: ${otherFirst} published` : ''}`;
    if (i.mine && i.mine.criteriaCount > 0) {
      const n = i.mine.criteriaCount;
      return make(
        'attention',
        { kind: 'needs-score', label: 'Needs your score' },
        { kind: 'draft', line1: 'Your draft', line2: `${n} of ${i.criteriaTotal}` },
        steps('scoring', i, `${pubNote}, your draft ${n} of ${i.criteriaTotal}`),
        'Continue scoring',
      );
    }
    return make('attention', { kind: 'needs-score', label: 'Needs your score' }, { kind: 'none', line1: 'Not started' }, steps('scoring', i, pubNote), 'Start scoring');
  }

  // Someone else's interview: progress without values (admin and board only).
  if (!i.progress) return make('attention', { kind: 'waiting', label: 'Waiting on scores' }, none, steps('scoring', i), 'Open application');
  const waiting = i.pair.filter((p) => !pubIds.has(p.id));
  const pubs = 2 - waiting.length;
  const label = waiting.length === 1 ? `Waiting on ${waiting[0].name}` : 'Waiting on scores';
  return make('attention', { kind: 'waiting', label }, { kind: 'none', line1: `${pubs} of 2` }, steps('scoring', i, `${pubs} of 2 published`), 'Open application');
}

// ---- the ranking (Selection) -----------------------------------------------------------------------------------

/**
 * The combined-score labels for a ranking, best first. One decimal ("4.8") unless two different scores would print the
 * same; those print with two ("4.83", "4.78"), so equal labels always mean a real tie.
 */
export function combinedLabels(scores: number[]): string[] {
  const one = scores.map((s) => s.toFixed(1));
  return scores.map((s, i) => {
    const clash = scores.some((t, j) => j !== i && one[j] === one[i] && t.toFixed(2) !== s.toFixed(2));
    return clash ? s.toFixed(2) : one[i];
  });
}

/** Sorts best combined score first; equal scores keep the earlier applicant first (by code). */
export function sortRanking<T extends { combined: number; code: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.combined - a.combined || a.code.localeCompare(b.code));
}

/** "Legacy Scholarship" -> "Legacy"; "BTX Think Big Award" -> "Think Big". */
export function shortAwardName(name: string): string {
  return name.replace(/^BTX /, '').replace(/ (Scholarship|Award)$/, '');
}
