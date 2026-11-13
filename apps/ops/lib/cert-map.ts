// Pure helpers for the Certifications page (no database, no React, so they are unit tested: tests/cert-map.test.ts):
// the words the page draws (the news card's kicker, a step's due line, the progress bar), the live rows mapped into the
// page's shape (lib/cert-view.ts), and what each control may do in live mode.
import { daysFrom, dueTitle, fullDate, rel } from './refresh-time';
import type { CertCaps, CertIdea, CertOwner, CertPerson, CertPlan, CertStatus, CertStep } from './cert-view';

type Row = Record<string, unknown>;

// A value as text ('' for null or undefined).
const s = (v: unknown): string => (v == null ? '' : String(v));

/** 150000 cents -> "$1,500" (cents only when there are some). */
export function usd(cents: number): string {
  const d = cents / 100;
  return `$${d.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(d) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** "1 idea", "3 ideas". */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The step that is now: the first one not done (null when every step is done or there are none). */
export function nextStep<T extends Pick<CertStep, 'status'>>(steps: T[]): T | null {
  return steps.find((x) => x.status !== 'done') ?? null;
}

/** Done of total for the slim bar beside "Setup checklist", and which segment is now. */
export function progress(steps: Pick<CertStep, 'id' | 'status'>[]): { done: number; total: number; nowId: string | null } {
  return { done: steps.filter((x) => x.status === 'done').length, total: steps.length, nowId: nextStep(steps)?.id ?? null };
}

/** The news card under the title: the next step, its due word and whose it is. Null when nothing is left to do. */
export type CertNews = { kicker: string; title: string; gold: boolean; icon: 'alert' | 'wait'; stepId: string };

/**
 * The news card for the next step (the demo's nextCard): "13 days late", "Due next Thu", "From January" or "Next step",
 * then " · No owner" or " · <first name>" when it is someone else's. Gold when the step is the viewer's.
 */
export function certNews(today: string, steps: CertStep[]): CertNews | null {
  const st = nextStep(steps);
  if (!st) return null;
  const late = !!st.due && daysFrom(today, st.due) < 0;
  let kicker: string;
  if (st.due) kicker = late ? rel(today, st.due) : `Due ${rel(today, st.due).replace(/^(Today|Tomorrow|Next )/, (m) => m.toLowerCase())}`;
  else kicker = st.dueText || 'Next step';
  const mine = !!st.owner?.mine;
  if (st.unassigned) kicker += ' · No owner';
  else if (st.owner && !mine) kicker += ` · ${st.owner.name.split(' ')[0]}`;
  return { kicker, title: st.title, gold: mine, icon: late ? 'alert' : 'wait', stepId: st.id };
}

/**
 * The due line above a step's title (the eyebrow): "Done" (quiet), a late tag, the due word, the words instead of a
 * day, or "No date" (quiet). Null when the step shows no due line at all. `title` is the hover text.
 */
export type DueLine = { text: string; late: boolean; muted: boolean; title?: string };

/** The eyebrow of one step (see DueLine). */
export function dueLine(today: string, st: Pick<CertStep, 'status' | 'due' | 'dueText' | 'noDue'>): DueLine | null {
  if (st.status === 'done') return { text: 'Done', late: false, muted: true, title: st.due ? `Done by ${fullDate(st.due)}` : undefined };
  if (st.due) return { text: rel(today, st.due), late: daysFrom(today, st.due) < 0, muted: false, title: dueTitle(today, st.due) };
  if (st.dueText) return { text: st.dueText, late: false, muted: false };
  if (st.noDue) return null;
  return { text: 'No date', late: false, muted: true };
}

/** The program status beside the title. */
export const CERT_STATUS: Record<string, string> = { planned: 'Planned', setting_up: 'In setup', active: 'Active', paused: 'Paused', ended: 'Ended' };

/** The most seat squares drawn (a bigger target still reads in the label and the line under the budget). */
export const MAX_SEATS = 12;

/** The plan strip from the programs row (live mode). */
export function livePlan(p: Row): CertPlan {
  const budget = p.pilot_budget_cents == null ? null : Number(p.pilot_budget_cents);
  const target = p.students_target == null ? null : Number(p.students_target);
  const per = p.cost_per_student_cents == null ? null : Number(p.cost_per_student_cents);
  let line: string;
  if (per != null && target != null) line = `BTX pays exam fees: about ${usd(per)} each for up to ${target} student${target === 1 ? '' : 's'}`;
  else if (per != null) line = `BTX pays exam fees: about ${usd(per)} each`;
  else line = s(p.summary) || 'Cost per student not set';
  const seats = target != null && target > 0 ? Math.min(MAX_SEATS, Math.floor(target)) : 0;
  return {
    budget: budget == null ? 'Not set' : usd(budget),
    note: s(p.budget_period) || null,
    seats,
    seatsLabel: target != null && target > 0 ? plural(target, 'seat', 'seats') : 'No seats yet',
    line,
  };
}

/** True for the checklist step that holds the certification ideas ("Pick the first certifications"). */
export const isIdeasTitle = (title: string) => /certif|idea/i.test(title);

/**
 * The checklist steps from the live rows: tasks of the program's checklists (declined ones left out), in checklist
 * order, each with its first assignee who is on the staff list (or "No owner" while open). Only the first step about
 * picking certifications holds the ideas.
 */
export function liveSteps(tasks: Row[], assignees: Row[], staff: CertPerson[], me: string): CertStep[] {
  const people = new Map(staff.map((p) => [p.id, p]));
  const who = new Map<string, string[]>();
  for (const a of assignees) {
    const list = who.get(s(a.task_id)) ?? [];
    list.push(s(a.user_id));
    who.set(s(a.task_id), list);
  }
  const rows = tasks
    .filter((t) => t.status !== 'declined')
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0) || s(a.id).localeCompare(s(b.id)));
  let ideasTaken = false;
  return rows.map((t) => {
    const id = s(t.id);
    const p = (who.get(id) ?? []).map((u) => people.get(u)).find(Boolean);
    const status: CertStatus = t.status === 'done' ? 'done' : t.status === 'in_progress' ? 'in_progress' : 'open';
    const owner: CertOwner | null = p ? { id: p.id, name: p.name, initials: p.initials, mine: p.id === me } : null;
    const title = s(t.title);
    const ideas = !ideasTaken && isIdeasTitle(title);
    if (ideas) ideasTaken = true;
    return {
      id,
      title,
      owner,
      // A group task (all board members) has an owner group, so it is not "No owner".
      unassigned: !owner && !t.assignee_group && status !== 'done',
      due: t.due_on ? s(t.due_on).slice(0, 10) : null,
      dueText: null,
      noDue: false,
      sub: s(t.note) || null,
      call: null,
      ideas,
      status,
      approval: t.type === 'approval',
      position: Number(t.position ?? 0),
    };
  });
}

/** The ideas from certification_ideas rows, oldest first ("You" for the viewer's own). */
export function liveIdeas(rows: Row[], staff: CertPerson[], me: string): CertIdea[] {
  const people = new Map(staff.map((p) => [p.id, p]));
  return [...rows]
    .sort((a, b) => s(a.created_at).localeCompare(s(b.created_at)) || s(a.id).localeCompare(s(b.id)))
    .map((r) => {
      const u = s(r.suggested_by);
      return {
        id: s(r.id),
        name: s(r.name),
        by: u === me ? 'You' : (people.get(u)?.name ?? 'A board member'),
        decision: r.decision === 'chosen' ? 'chosen' : r.decision === 'dropped' ? 'dropped' : 'open',
      };
    });
}

/** The staff list from staff_profiles rows. */
export function liveStaff(rows: Row[]): CertPerson[] {
  return rows.map((r) => ({ id: s(r.user_id), name: s(r.display_name), initials: s(r.initials) }));
}

/**
 * What live mode may do: tick (tasks.status) and add a task or an idea once the program row exists; the chat composer
 * once there is a channel and the person may post. Day words and names in "Add a task", idea decisions, Undo and the N key
 * have no live write: not drawn.
 */
export function liveCaps(o: { programId: string | null; chat: boolean }): CertCaps {
  return { tick: true, addTask: !!o.programId, parse: false, addIdea: !!o.programId, decide: false, undo: false, nKey: false, chat: o.chat };
}

/** The position for a new step: after the last one. */
export const nextPosition = (steps: Pick<CertStep, 'position'>[]) => steps.reduce((m, x) => Math.max(m, x.position), 0) + 1;

/**
 * Where the ideas for the call are drawn, so they can always be reached:
 * - 'step': inside the step about picking certifications while it is the step that is now (the demo), with "Add an idea".
 * - 'fold': under that step behind its "N ideas" toggle, while another step comes first (the demo); `withAdd` when the
 *   step is done, so "Add an idea" stays reachable.
 * - 'panel': their own "Certification ideas" panel after the checklist, with "Add an idea", when no step is about picking
 *   certifications (or there are no steps), or that step is done and there are no ideas to fold.
 */
export type IdeasPlace = { at: 'step' | 'fold' | 'panel'; stepId: string | null; withAdd: boolean };

/** The place for the ideas (see IdeasPlace). */
export function ideasPlace(steps: Pick<CertStep, 'id' | 'ideas' | 'status'>[], nowId: string | null, ideaCount: number): IdeasPlace {
  const st = steps.find((x) => x.ideas);
  if (!st) return { at: 'panel', stepId: null, withAdd: true };
  if (st.id === nowId) return { at: 'step', stepId: st.id, withAdd: true };
  if (st.status === 'done') return ideaCount ? { at: 'fold', stepId: st.id, withAdd: true } : { at: 'panel', stepId: null, withAdd: true };
  return { at: 'fold', stepId: st.id, withAdd: false };
}

/** An add whose write was reported as failed (its id and the words given back to the box). */
export type FailedAdd = { id: string; kind: 'task' | 'idea'; words: string };

/**
 * After fresh server data: adds reported as failed that the server now lists did save after all (a timed-out answer).
 * Returns the adds still unaccounted for, whether the save error should go, and the two boxes with those words cleared
 * (a box holding other words is left alone), so "Try again" cannot make a second copy.
 */
export function settleFailed(failed: FailedAdd[], listed: Set<string>, boxes: { task: string; idea: string }): { left: FailedAdd[]; clearErr: boolean; task: string; idea: string } {
  const saved = failed.filter((f) => listed.has(f.id));
  const left = failed.filter((f) => !listed.has(f.id));
  let { task, idea } = boxes;
  for (const f of saved) {
    if (f.kind === 'task' && task.trim() === f.words) task = '';
    if (f.kind === 'idea' && idea.trim() === f.words) idea = '';
  }
  return { left, clearErr: saved.length > 0, task, idea };
}

/** Statuses ticked on this page that the server has not confirmed yet, by step id. */
export type StatusOverrides = Record<string, CertStatus>;

/** The steps as drawn: the server's (or last seeded) steps with the local ticks on top. */
export const applyOverrides = <T extends Pick<CertStep, 'id' | 'status'>>(rows: T[], ov: StatusOverrides): T[] => rows.map((x) => (ov[x.id] ? { ...x, status: ov[x.id] } : x));

/** A tick drawn at once. */
export const setOverride = (ov: StatusOverrides, id: string, to: CertStatus): StatusOverrides => ({ ...ov, [id]: to });

/** A refused tick: its local status goes, so the server's status shows again (never an older local guess). */
export function dropOverride(ov: StatusOverrides, id: string): StatusOverrides {
  const n = { ...ov };
  delete n[id];
  return n;
}
