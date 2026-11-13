// Pure mapping for the Interview questions page (shape in lib/questions-view.ts): database rows to groups, the next
// interview from the person's pairings, the caps, the numbering, the ticket's words and the news card. No reads, no
// clock: everything is passed in, so it is unit-tested (tests/questions-map.test.ts).
import { MO, clock, easternDay, weekday } from './refresh-time';
import type { QnCaps, QnGroup, QnNext, QnView } from './questions-view';

/** One database row, loosely typed (the Ops Hub tables are not in the generated types). */
export type Row = Record<string, unknown>;

/** "To close": the group of questions under no scoring criterion. */
export const TO_CLOSE_NAME = 'To close';
/**
 * The internal key of the "To close" group (its database key is null). The "~" keeps it outside what the database allows
 * for a criterion key (^[a-z_]{2,40}$), so no real criterion can ever share it.
 */
export const CLOSE_KEY = '~close';
/** A group's key as a string (for DOM ids and maps). */
export const gkOf = (key: string | null): string => key ?? CLOSE_KEY;

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0);

/**
 * Puts the questions under their criteria (rubric order by position, then key) and the rest under "To close". Questions
 * keep the order of `questions` (the reader orders by position, created_at, id). A question whose key is not in the
 * rubric goes nowhere (the database's foreign key keeps that from happening).
 */
export function qnGroups(rubric: Row[], questions: Row[]): QnGroup[] {
  const crit = [...rubric].sort((a, b) => num(a.position) - num(b.position) || str(a.key).localeCompare(str(b.key)));
  const groups: QnGroup[] = crit.map((c) => ({ key: str(c.key), name: str(c.name), weight: num(c.weight), questions: [] }));
  const close: QnGroup = { key: null, name: TO_CLOSE_NAME, weight: null, questions: [] };
  const byKey = new Map(groups.map((g) => [g.key, g]));
  for (const q of questions) {
    const key = q.criterion_key == null ? null : str(q.criterion_key);
    const g = key === null ? close : byKey.get(key);
    if (g) g.questions.push({ id: str(q.id), text: str(q.text) });
  }
  return [...groups, close];
}

/** Questions are numbered 1, 2, 3 ... down the whole page, across groups. */
export function qnNumbers(groups: QnGroup[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const g of groups) for (const q of g.questions) m.set(q.id, m.size + 1);
  return m;
}

/** How many questions the page has. */
export const qnTotal = (groups: QnGroup[]): number => groups.reduce((n, g) => n + g.questions.length, 0);

/** The width of a group's points bar, as a percent of the heaviest criterion (20 points = full in the sample). */
export function ptsWidth(weight: number, groups: QnGroup[]): number {
  const max = Math.max(0, ...groups.map((g) => g.weight ?? 0));
  return max > 0 ? Math.min(100, (weight / max) * 100) : 0;
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** Small counts in words ("six"), larger ones in digits. */
export const numberWord = (n: number): string => WORDS[n] ?? String(n);

/** The empty state's line: what "Use the starter questions" adds (admins), or who will add them (everyone else). */
export function emptyLine(admin: boolean, starterCount: number, scoredCount: number): string {
  if (!admin) return 'A board member with admin rights will add them.';
  return `${starterCount} starter questions, under the ${numberWord(scoredCount)} scored areas and ${TO_CLOSE_NAME}.`;
}

/** Live caps. Every write is an admin-only server action (lib/actions/interview-questions.ts), and needs a published cycle. */
export function liveCaps(isAdmin: boolean, hasCycle: boolean): QnCaps {
  const can = isAdmin && hasCycle;
  return {
    edit: can, // saveInterviewQuestion with an id
    add: can, // saveInterviewQuestion without an id
    remove: can, // removeInterviewQuestion
    move: can, // moveInterviewQuestion
    drag: can, // the same moveInterviewQuestion, once per place (lib/questions-flow.ts movesFor)
    starter: can, // addStarterQuestions
    editUndo: can, // another saveInterviewQuestion with the previous words (guarded like any edit)
    addUndo: can, // removeInterviewQuestion of the id the add returned
    moveUndo: can, // the reverse moveInterviewQuestion calls
    removeUndo: false, // no write brings a removed question back
    starterUndo: false, // no single reverse write
    draftChip: false, // no column holds a draft state
  };
}

/** Mock caps: everything the demo draws, for admins; nothing for a board member without admin rights. */
export function mockCaps(isAdmin: boolean): QnCaps {
  const c = isAdmin;
  return { edit: c, add: c, remove: c, move: c, drag: c, starter: c, editUndo: c, addUndo: c, moveUndo: c, removeUndo: c, starterUndo: c, draftChip: c };
}

/**
 * The person's next interview: the earliest of their pairings (they are one of the two) that is still to come and has an
 * active booking. `pairings` rows carry `slot_id, interviewer_a, interviewer_b` and the slot's `starts_at, ends_at`
 * (embedded as `interview_slots`); `bookings` `slot_id, application_id`; `apps` `id, applicant_code, full_name`;
 * `staff` `user_id, display_name`.
 */
export function pickNext(me: string, pairings: Row[], bookings: Row[], apps: Row[], staff: Row[], nowIso: string): QnNext | null {
  const slotOf = (p: Row): Row | null => {
    const s = p.interview_slots;
    const one = Array.isArray(s) ? s[0] : s;
    return one && typeof one === 'object' ? (one as Row) : null;
  };
  const booked = new Map(bookings.map((b) => [str(b.slot_id), str(b.application_id)]));
  const appById = new Map(apps.map((a) => [str(a.id), a]));
  const names = new Map(staff.map((s) => [str(s.user_id), str(s.display_name)]));
  const now = Date.parse(nowIso);
  const mine = pairings
    .map((p) => ({ p, s: slotOf(p) }))
    .filter(({ p, s }) => s && (str(p.interviewer_a) === me || str(p.interviewer_b) === me) && Date.parse(str(s.starts_at)) > now && booked.has(str(p.slot_id)))
    .sort((x, y) => str(x.s?.starts_at).localeCompare(str(y.s?.starts_at)) || str(x.p.slot_id).localeCompare(str(y.p.slot_id)));
  for (const { p, s } of mine) {
    const app = appById.get(booked.get(str(p.slot_id)) ?? '');
    if (!app || !s) continue;
    const other = str(p.interviewer_a) === me ? str(p.interviewer_b) : str(p.interviewer_a);
    const code = str(app.applicant_code) || '—';
    return { startsAt: str(s.starts_at), endsAt: str(s.ends_at), code, applicant: str(app.full_name).trim() || code, withName: names.get(other) || 'the other interviewer' };
  }
  return null;
}

/** The ticket's words: the date block (weekday, day, month), the Eastern time and the length in minutes. */
export function ticketOf(n: QnNext): { wd: string; day: number; mon: string; time: string; minutes: number } {
  const day = easternDay(n.startsAt);
  const minutes = Math.max(0, Math.round((Date.parse(n.endsAt) - Date.parse(n.startsAt)) / 60_000));
  return { wd: weekday(day), day: Number(day.slice(8, 10)), mon: MO[Number(day.slice(5, 7)) - 1], time: clock(n.startsAt), minutes };
}

/** The news card under the title: the next interview (opens the ticket), or, for an admin with no questions, "Add". */
export type QnNews = { kicker: string; title: string; go: string; icon: 'video' | 'plus'; gold: boolean; to: 'next' | 'start' } | null;

/** Which news card the page shows. */
export function newsOf(view: Pick<QnView, 'next' | 'caps'>, total: number): QnNews {
  if (total === 0) return view.caps.starter ? { kicker: 'No questions yet', title: 'Interview questions', go: 'Add', icon: 'plus', gold: true, to: 'start' } : null;
  if (!view.next) return null;
  const t = ticketOf(view.next);
  return { kicker: `Next · ${t.wd} ${t.mon} ${t.day}, ${t.time}`, title: view.next.applicant, go: 'See it', icon: 'video', gold: false, to: 'next' };
}
