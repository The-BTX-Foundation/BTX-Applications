// Pure mapping for the page for one interview (shape in lib/interview-page-view.ts): database rows to the view, the caps,
// who may read what, and the notes grouped by question. No reads, no clock: everything is passed in, so
// tests/interview-page-map.test.ts checks every rule with sample rows.
import { gkOf, qnGroups } from './questions-map';
import type { InterviewPageView, IpCaps, IpGroup, IpNote, IpPerson } from './interview-page-view';
import { OVERALL } from './interview-page-view';

/** A database row, loosely typed (the Ops Hub tables are not in the generated types). */
export type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const orNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

/** A real uuid (anything else is never sent to the database and answers "no such interview"). */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "DM" from "Dana Mercer". */
export function initialsFrom(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (w.length === 0) return '?';
  return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[w.length - 1][0]).toUpperCase();
}

/** The viewer may see the link and everyone's notes: one of the two interviewers, or an admin. */
export function canReadNotes(me: string | null, isAdmin: boolean, pairIds: string[]): boolean {
  return isAdmin || (me !== null && pairIds.includes(me));
}

/**
 * Live caps. `change`: admins, with two interviewers on it (changeInterviewerAction checks admin rights again on the
 * server). `notes`: the viewer can read the notes, is signed in and the notes read worked (saveInterviewNoteAction checks
 * the same rule). `score`: the viewer is one of the two (only interviewers have a score sheet).
 */
export function capsFor(me: string | null, isAdmin: boolean, pairIds: string[], notesFailed: boolean): IpCaps {
  const mine = me !== null && pairIds.includes(me);
  return {
    change: isAdmin && pairIds.length === 2,
    notes: me !== null && canReadNotes(me, isAdmin, pairIds) && !notesFailed,
    score: mine,
  };
}

/** The questions in the Questions page's order (scoring areas by position, then "To close"), numbered down the page; empty areas left out. */
export function questionGroups(rubric: Row[], questions: Row[]): IpGroup[] {
  let n = 0;
  return qnGroups(rubric, questions)
    .filter((g) => g.questions.length > 0)
    .map((g) => ({ key: gkOf(g.key), name: g.name, questions: g.questions.map((q) => ({ id: q.id, n: ++n, text: q.text })) }));
}

/**
 * Splits note rows into the viewer's own words (by question id or OVERALL) and other people's non-empty notes, read only.
 * Other people's notes are kept only when `canRead` (the database already refuses them; this is defence in depth). A
 * note on a question that is no longer listed is dropped from `others` and `mine` both.
 */
export function splitNotes(rows: Row[], me: string | null, canRead: boolean, questionIds: Set<string>, names: Map<string, string>): { mine: Record<string, string>; others: Record<string, IpNote[]> } {
  const mine: Record<string, string> = {};
  const others: Record<string, IpNote[]> = {};
  for (const r of rows) {
    const q = r.question_id == null ? OVERALL : str(r.question_id);
    if (q !== OVERALL && !questionIds.has(q)) continue;
    const author = str(r.author_id);
    const body = typeof r.body === 'string' ? r.body : '';
    if (me !== null && author === me) {
      mine[q] = body;
    } else if (canRead && body.trim() !== '') {
      (others[q] ??= []).push({ authorId: author, name: names.get(author) ?? 'A board member', body });
    }
  }
  for (const k of Object.keys(others)) others[k].sort((a, b) => a.name.localeCompare(b.name) || a.authorId.localeCompare(b.authorId));
  return { mine, others };
}

/** The rows the live page reads. `questions` / `notes` are null when that optional read failed. */
export type IpRows = {
  slot: Row;
  application: Row;
  pairing: Row | null;
  cycle: Row | null;
  staff: Row[];
  rubric: Row[];
  questions: Row[] | null;
  notes: Row[] | null;
};

/** Builds the view from the live rows for the viewer. */
export function mapInterviewPage(rows: IpRows, me: string | null, isAdmin: boolean): InterviewPageView {
  const names = new Map(rows.staff.map((s) => [str(s.user_id), str(s.display_name).trim() || 'A board member']));
  const initials = new Map(rows.staff.map((s) => [str(s.user_id), str(s.initials).trim()]));
  const pairIds = rows.pairing ? [str(rows.pairing.interviewer_a), str(rows.pairing.interviewer_b)].filter(Boolean) : [];
  const pair: IpPerson[] = pairIds.map((id) => {
    const name = names.get(id) ?? 'A board member';
    return { id, name, initials: initials.get(id) || initialsFrom(name), me: id === me };
  });
  const canRead = canReadNotes(me, isAdmin, pairIds);
  const link = orNull(rows.pairing?.video_url);
  const groups = rows.questions ? questionGroups(rows.rubric, rows.questions) : [];
  const ids = new Set(groups.flatMap((g) => g.questions.map((q) => q.id)));
  const notesFailed = canRead && rows.notes === null;
  const { mine, others } = splitNotes(rows.notes ?? [], me, canRead, ids, names);
  const code = orNull(rows.application.applicant_code) ?? '—';
  const award = [orNull(rows.cycle?.term), orNull(rows.cycle?.award_name)].filter(Boolean).join(' ') || null;
  return {
    source: 'live',
    slotId: str(rows.slot.id),
    startsAt: orNull(rows.slot.starts_at),
    endsAt: orNull(rows.slot.ends_at),
    name: orNull(rows.application.full_name)?.trim() || code,
    code,
    award,
    pair,
    me,
    isAdmin,
    canRead,
    link: canRead ? link : null,
    linkHidden: !canRead && link !== null,
    groups,
    questionsFailed: rows.questions === null,
    mine: canRead ? mine : {},
    others: canRead ? others : {},
    notesFailed,
    caps: capsFor(me, isAdmin, pairIds, notesFailed),
    sim: null,
  };
}

/** The interview's length in minutes, or null. */
export function minutesOf(startsAt: string | null, endsAt: string | null): number | null {
  if (!startsAt || !endsAt) return null;
  const m = Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60_000);
  return Number.isFinite(m) && m > 0 ? m : null;
}

/** The interviewers' notes on one question (or overall), as the Scoring page's notes panel draws them. */
export type NotesByQuestion = { label: string; notes: { name: string; body: string }[] };

/**
 * The Scoring page's read-only view of one interview's notes: grouped by question in the Questions page's order
 * ("3. <question>"), then "Overall notes"; non-empty notes only, each author once, "You" for the signed-in person first.
 * A note on a question that is no longer listed is left out.
 */
export function notesForScoring(groups: IpGroup[], rows: Row[], names: Map<string, string>, me: string): NotesByQuestion[] {
  const byKey = new Map<string, { name: string; body: string; mine: boolean }[]>();
  for (const r of rows) {
    const body = typeof r.body === 'string' ? r.body : '';
    if (body.trim() === '') continue;
    const k = r.question_id == null ? OVERALL : str(r.question_id);
    const author = str(r.author_id);
    const list = byKey.get(k) ?? [];
    list.push({ name: author === me ? 'You' : (names.get(author) ?? 'A board member'), body, mine: author === me });
    byKey.set(k, list);
  }
  const ordered = (k: string) => (byKey.get(k) ?? []).sort((a, b) => Number(b.mine) - Number(a.mine) || a.name.localeCompare(b.name)).map(({ name, body }) => ({ name, body }));
  const out: NotesByQuestion[] = [];
  for (const g of groups) for (const q of g.questions) if (byKey.has(q.id)) out.push({ label: `${q.n}. ${q.text}`, notes: ordered(q.id) });
  if (byKey.has(OVERALL)) out.push({ label: 'Overall notes', notes: ordered(OVERALL) });
  return out;
}
